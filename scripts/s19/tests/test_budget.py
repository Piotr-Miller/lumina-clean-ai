"""run-candidate.py: the phase cap cannot reset or overshoot, and nothing is sent unapproved.

The provider is replaced by a fake; a socket guard fails any real connection. Each test drives
the runner through its CLI entry point `main(argv)`.
"""

from __future__ import annotations

import contextlib
import json
import multiprocessing as mp
import os
import socket
import io
import time
import unittest
from pathlib import Path
from unittest import mock

from fixtures import World, load, png_bytes, sha

runner = load("run-candidate")


def no_network(*_a, **_k):
    raise AssertionError("a real network connection was attempted")


class Fake:
    """Scripted provider: each call pops the next outcome."""

    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def __call__(self, config, image, size):
        self.calls += 1
        o = self.outcomes.pop(0) if self.outcomes else "ok"
        if o == "ok":
            return {"http_status": 200, "output": png_bytes(size), "usage": None}
        if o == "timeout":
            raise TimeoutError("read timed out")
        if isinstance(o, int):
            return {"http_status": o, "error": {"message": f"http {o}"}}
        raise AssertionError(o)


class BudgetTest(World):
    def setUp(self):
        super().setUp()
        self.prepare("T-01", "T-02", "T-03")
        self.cfg = self.make_config(bound_usd=1.00)
        self.series = self.make_series([(self.cfg, "core", ["T-01", "T-02", "T-03"], 2)])
        self.set_records(["S19-SPEND phase=3 cap_usd=3 decision=approved date=2026-11-01"])
        patcher = mock.patch.object(socket.socket, "connect", no_network)
        patcher.start()
        self.addCleanup(patcher.stop)
        keys = mock.patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "FAL_KEY": "test-key"})
        keys.start()
        self.addCleanup(keys.stop)

    def run_main(self, *ids, cap="3", fake=None, extra=(), config=None, series=None):
        fake = fake or Fake()
        argv = ["--config", str(config or self.cfg), "--phase", "3", "--series", str(series or self.series),
                "--cap", cap, "--resume", *extra, *ids]
        with mock.patch.object(runner, "call_provider", fake), contextlib.redirect_stdout(None):
            code = runner.main(argv, sleep=lambda s: None)
        return code, fake

    def ledger(self):
        return runner.read_ledger()

    def committed(self):
        return runner.phase_committed(self.ledger(), 3)[0]

    def test_refuses_before_the_network_when_the_bound_does_not_fit(self):
        code, fake = self.run_main("T-01", "T-02", cap="3")
        self.assertEqual((code, fake.calls), (0, 2))
        self.set_records(["S19-SPEND phase=3 cap_usd=2.5 decision=approved date=2026-11-01"])
        code, fake = self.run_main("T-03", cap="2.5")
        self.assertEqual(code, 1)
        self.assertEqual(fake.calls, 0, "a call was sent although $2 + $1 > $2.50")
        refusals = [r for r in self.ledger() if r["event"] == "budget_refusal"]
        self.assertEqual([(r["photo"], r["committed_usd"], r["cap_usd"]) for r in refusals], [("T-03", 2.0, 2.5)])

    def test_admits_exactly_at_the_cap_and_not_beyond(self):
        code, fake = self.run_main("T-01", "T-02", "T-03")
        self.assertEqual((code, fake.calls), (0, 3))
        self.assertEqual(self.committed(), 3.0)
        code, fake = self.run_main("T-01", extra=["--repeat", "2"])
        self.assertEqual((code, fake.calls), (1, 0))
        self.assertEqual(self.committed(), 3.0)

    def test_timeout_keeps_its_reservation_and_retries_once(self):
        code, fake = self.run_main("T-01", fake=Fake("timeout", "timeout"))
        self.assertEqual((code, fake.calls), (0, 2))
        statuses = [r["status"] for r in self.ledger() if r["event"] == "result"]
        self.assertEqual(statuses, ["unknown", "unknown"])
        terminal = [r for r in self.ledger() if r["event"] == "slot_terminal"]
        self.assertEqual([(t["photo"], t["status"]) for t in terminal], [("T-01", "technical_failure")])
        self.assertEqual(self.committed(), 2.0, "both unknown results must stay fully reserved")

    def test_non_transient_error_is_terminal_without_retry(self):
        code, fake = self.run_main("T-01", fake=Fake(400))
        self.assertEqual((code, fake.calls), (0, 1))
        self.assertEqual(self.committed(), 1.0)
        self.assertEqual([r["status"] for r in self.ledger() if r["event"] == "slot_terminal"], ["technical_failure"])

    def test_interrupted_attempt_survives_a_restart(self):
        with runner.locked():
            runner.append({"event": "reserve", "attempt_id": "crashed", "phase": 3, "series_id": "s",
                           "config_sha256": next(iter(json.loads(self.series.read_text())["configs"])),
                           "config_name": "fake-gpt", "input_sha256": self.sidecar("T-01")["common"]["sha256"],
                           "photo": "T-01", "slot": 1, "ordinal": 1, "role": "core", "request_size": [1, 1],
                           "reserved_usd": 1.0, "requested_at": "x"})
        self.assertEqual(self.committed(), 1.0)
        code, fake = self.run_main("T-01")  # the crashed attempt used one of the two attempts
        self.assertEqual((code, fake.calls), (0, 1))
        self.assertEqual(self.committed(), 2.0)
        code, fake = self.run_main("T-01")  # restart: resolved slot, nothing re-sent, nothing reset
        self.assertEqual((code, fake.calls), (0, 0))
        self.assertEqual(self.committed(), 2.0)

    def test_switching_config_shares_the_phase_ledger(self):
        other = self.make_config(name="other", bound_usd=1.00)
        series = self.make_series([(self.cfg, "core", ["T-01", "T-02"], 1), (other, "probe", ["T-03"], 1)],
                                  series_id="mixed")
        self.run_main("T-01", "T-02", series=series)
        code, fake = self.run_main("T-03", config=other, series=series)
        self.assertEqual((code, fake.calls), (0, 1))
        self.set_records(["S19-SPEND phase=3 cap_usd=3 decision=approved date=2026-11-01"])
        third = self.make_config(name="third", bound_usd=1.00)
        series3 = self.make_series([(third, "probe", ["T-01"], 1)], series_id="third")
        code, fake = self.run_main("T-01", config=third, series=series3)
        self.assertEqual((code, fake.calls), (1, 0), "a third config must not reset the $3 phase ledger")

    def test_no_paid_call_without_a_matching_approval(self):
        self.set_records([])
        code, fake = self.run_main("T-01")
        self.assertEqual((code, fake.calls), (1, 0))
        self.set_records(["S19-SPEND phase=3 cap_usd=3 decision=declined date=2026-11-01"])
        self.assertEqual(self.run_main("T-01")[1].calls, 0)
        self.set_records(["S19-SPEND phase=3 cap_usd=5 decision=approved date=2026-11-01"])
        code, fake = self.run_main("T-01", cap="3")
        self.assertEqual((code, fake.calls), (1, 0), "--cap must equal the approved cap")
        self.assertEqual(self.ledger(), [])

    def test_dry_run_needs_no_approval_and_reserves_nothing(self):
        self.set_records([])
        code, fake = self.run_main("T-01", "T-02", "T-03", extra=["--dry-run"])
        self.assertEqual((code, fake.calls), (0, 0), "$3 of bounds fits the $3 cap")
        code, fake = self.run_main("T-01", "T-02", extra=["--dry-run", "--repeat", "2"])
        self.assertEqual((code, fake.calls), (1, 0), "$4 of bounds does not fit the $3 cap")
        self.assertEqual(self.ledger(), [])

    def test_usage_above_the_bound_stops_the_runner(self):
        gpt = json.loads(self.cfg.read_text())

        def pricey(config, image, size):
            return {"http_status": 200, "output": png_bytes(size),
                    "usage": {"output_tokens_details": {"image_tokens": 100_000},
                              "input_tokens_details": {"image_tokens": 0, "text_tokens": 0}}}

        self.assertEqual(gpt["cost_bound"]["usd_per_million_output_image_tokens"], 30)
        code, _ = self.run_main("T-01", "T-02", fake=pricey)
        self.assertEqual(code, 1)
        sent = [r for r in self.ledger() if r["event"] == "reserve"]
        self.assertEqual(len(sent), 1, "no further call after a cost above its bound")

    def test_slot_outside_the_series_is_refused(self):
        code, fake = self.run_main("T-01", extra=["--repeat", "3"])
        self.assertEqual((code, fake.calls), (1, 0))

    # ------------------------------------------------ implementation review F1, F4, F5

    def test_missing_key_refuses_before_any_reservation(self):
        os.environ.pop("OPENAI_API_KEY")
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code, fake = self.run_main("T-01", "T-02")
        self.assertEqual((code, fake.calls), (1, 0))
        self.assertEqual(self.ledger(), [], "a missing key must not reserve any part of the cap")
        self.assertIn("OPENAI_API_KEY is not set", err.getvalue())

    def test_unreadable_usage_keeps_the_output_and_its_result_row(self):
        def odd_usage(config, image, size):
            return {"http_status": 200, "output": png_bytes(size),
                    "usage": {"output_tokens_details": None, "input_tokens_details": None}}

        code, fake = self.run_main("T-01", fake=odd_usage)
        self.assertEqual(code, 0)
        [res] = [r for r in self.ledger() if r["event"] == "result"]
        self.assertEqual((res["status"], res["cost_usd"]), ("ok", None))
        self.assertTrue((runner.protocol.ROOT / res["output_path"]).exists()
                        or Path(res["output_path"]).exists())
        self.assertEqual(self.committed(), 1.0, "an unknown cost keeps the full reservation")
        code, fake = self.run_main("T-01")
        self.assertEqual((code, fake.calls), (0, 0), "the paid result is reused, never bought again")

    def test_a_paid_response_that_cannot_be_saved_is_logged_and_never_repaid(self):
        with mock.patch.object(Path, "write_bytes", side_effect=OSError("disk full")):
            code, fake = self.run_main("T-01", "T-02")
        self.assertEqual((code, fake.calls), (1, 1), "the run stops after the local failure")
        [res] = [r for r in self.ledger() if r["event"] == "result"]
        self.assertEqual((res["status"], res["transient"]), ("unknown", False))
        self.assertEqual(self.committed(), 1.0)
        code, fake = self.run_main("T-01")
        self.assertEqual(fake.calls, 0, "a resume must not pay again for a response already received")

    def test_a_slot_held_by_another_process_is_refused_unsent(self):
        side = self.sidecar("T-01")["common"]
        key = runner.slot_key(sha(self.cfg), side["sha256"], "T-01", 1)
        with runner.slot_lock(key):
            code, fake = self.run_main("T-01")
        self.assertEqual((code, fake.calls), (1, 0))
        self.assertEqual([r for r in self.ledger() if r["event"] == "reserve"], [])
        code, fake = self.run_main("T-01")  # released (as a crash would release it): it now runs
        self.assertEqual((code, fake.calls), (0, 1))

    def test_series_that_no_longer_matches_its_inputs_or_config_is_refused(self):
        frozen = json.loads(self.series.read_text())
        for field, value in (("cost_bound_usd", 0.5), ("request_size", [16, 16]), ("input_sha256", "0" * 64)):
            edited = json.loads(json.dumps(frozen))
            edited["slots"][0][field] = value
            path = self.tmp / f"series-{field}.json"
            path.write_text(json.dumps(edited))
            code, fake = self.run_main("T-01", series=path)
            self.assertEqual((code, fake.calls), (1, 0), field)
        self.assertEqual(self.ledger(), [])


# ---------------------------------------------------------------- concurrent admission


def _admit_worker(args):
    private, attempt, slow, unlocked = args
    import os

    os.environ["S19_PRIVATE"] = private
    mod = load("run-candidate")
    if slow:
        real = mod.read_ledger

        def slow_read():
            rows = real()
            time.sleep(0.2)  # widen the read → append window
            return rows

        mod.read_ledger = slow_read
    if unlocked:
        mod.locked = contextlib.nullcontext
    ok, _ = mod.admit(3, 3.0, {"event": "reserve", "attempt_id": attempt, "phase": 3, "reserved_usd": 1.0})
    return ok


class ConcurrencyTest(World):
    def admit_many(self, unlocked: bool) -> int:
        self.private.mkdir(parents=True, exist_ok=True)
        ctx = mp.get_context("fork")
        with ctx.Pool(8) as pool:
            results = pool.map(_admit_worker, [(str(self.private), f"a{i}", True, unlocked) for i in range(8)])
        return sum(results)

    def test_eight_concurrent_admissions_reserve_exactly_three_dollars(self):
        self.assertEqual(self.admit_many(unlocked=False), 3)
        self.assertEqual(runner.phase_committed(runner.read_ledger(), 3)[0], 3.0)

    def test_negative_control_without_the_lock_overshoots(self):
        # Proves the test above can see the race it guards against: with the lock removed the
        # same eight workers admit more than the cap allows. Measured 2026-10-31, 5 runs each:
        # with the lock 3 of 8 admitted every run; without it 8 of 8 every run (detection 5/5).
        self.assertGreater(self.admit_many(unlocked=True), 3)


if __name__ == "__main__":
    unittest.main()
