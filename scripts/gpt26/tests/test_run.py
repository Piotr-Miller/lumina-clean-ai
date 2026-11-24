"""run.py, state.py and study.py offline: a fake provider, synthetic inputs and PNGs, a throwaway Git repo.

Nothing here reads the private corpus, a provider key or the network (a socket guard fails any
real connection). Each test builds its own repository holding copies of a fixture study's
registration and rule files (`tests/fixtures/`, the screen's six-slot shape; or a generated
16-slot study), with the series' input hashes rebound to generated images, and drives the runner
through `run.main(["--config", <config>, ...], root=<repo>)`. Private roots live inside the
throwaway repository, gitignored, exactly where the study descriptor derives them.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

GPT26 = Path(__file__).resolve().parents[1]
ROOT = GPT26.parents[1]
sys.path.insert(0, str(GPT26))


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


run = load("gpt26_run", GPT26 / "run.py")
state = run.state
runner = run.runner
check_series = run.check_series
study_mod = run.study_mod

FIXTURES = GPT26 / "tests" / "fixtures"
CONFIG = "scripts/gpt26/tests/fixtures/screen-config.json"
VIEWER_FIXTURE = FIXTURES / "compare-gpt26.html"
STUDY = study_mod.load(ROOT, CONFIG)[0]
CHANGE_MD = """# Fixture change

## Notes

A throwaway study for the GPT26 tests.

## GPT26 approvals

<!--
- GPT26-SPEND cap_usd=1.50 decision=approved date=YYYY-MM-DD
-->
"""

SPEND = "- GPT26-SPEND cap_usd={cap} decision=approved date=2026-11-17"
USAGE_OK = {"output_tokens_details": {"image_tokens": 2000},
            "input_tokens_details": {"image_tokens": 1500, "text_tokens": 100}}  # $0.073 at the config rates
USAGE_OVER = {"output_tokens_details": {"image_tokens": 10000},
              "input_tokens_details": {"image_tokens": 1500, "text_tokens": 100}}  # $0.313 > $0.20


def no_network(*_a, **_k):
    raise AssertionError("a real network connection was attempted")


def png(size, color=(40, 60, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", tuple(size), color).save(buf, format="PNG", compress_level=1)
    return buf.getvalue()


class Fake:
    """Scripted provider keyed by photo/slot: each call pops that slot's next outcome."""

    def __init__(self, script: dict | None = None, default="ok"):
        self.script = {k: list(v) for k, v in (script or {}).items()}
        self.default = default
        self.calls: list[str] = []

    def __call__(self, config, image, size):
        label = image.stem  # synthetic inputs are named <photo>.jpg
        self.calls.append(label)
        queue = self.script.get(label, [])
        o = queue.pop(0) if queue else self.default
        if o == "ok":
            return {"http_status": 200, "output": png(size), "usage": USAGE_OK}
        if o == "ok-nocost":
            return {"http_status": 200, "output": png(size), "usage": None}
        if o == "over":
            return {"http_status": 200, "output": png(size), "usage": USAGE_OVER}
        if o == "wrong-size":
            return {"http_status": 200, "output": png((size[0] // 2, size[1] // 2)), "usage": USAGE_OK}
        if o == "moderation":
            return {"http_status": 400, "error": {"error": {"code": "moderation_blocked", "message": "rejected"}}}
        if o == "timeout":
            raise TimeoutError("read timed out")
        if o == "crash":
            raise KeyboardInterrupt  # the process dies after reserving: no result row
        raise AssertionError(o)


class Screen(unittest.TestCase):
    """A throwaway repository with a fixture study's registration rebound to synthetic inputs."""

    CONFIG = CONFIG

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        self.write(".gitignore", "test-photos/private/\n")
        self.register()
        self.study = study_mod.load(self.repo, self.CONFIG)[0]
        for rel in (*self.study.rule_files, check_series.PHASE5_CONFIG, check_series.PHASE5_SERIES):
            target = self.repo / rel
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(VIEWER_FIXTURE if rel == self.study.viewer else ROOT / rel, target)
        (self.repo / self.study.change_md).parent.mkdir(parents=True, exist_ok=True)
        self.write(self.study.change_md, CHANGE_MD)
        self.paths = run.study_paths(self.repo, self.study)
        self.private, self.inputs = self.paths.private, self.paths.inputs
        self.inputs.mkdir(parents=True)
        series = json.loads((self.repo / self.study.series).read_text())
        phase5 = json.loads((ROOT / check_series.PHASE5_SERIES).read_text())
        hashes = {}
        for s in series["slots"]:
            if s["photo"] in hashes:
                continue
            path = self.inputs / f"{s['photo']}.jpg"
            Image.new("RGB", tuple(s["input_dimensions"]), (20, 20, 30)).save(path, format="JPEG", quality=30)
            hashes[s["photo"]] = hashlib.sha256(path.read_bytes()).hexdigest()
            (self.inputs / f"{s['photo']}.json").write_text(json.dumps(
                {"common": {"path": str(path), "sha256": hashes[s["photo"]], "dimensions": s["input_dimensions"]}}))
        for s in series["slots"]:
            s["input_sha256"] = hashes[s["photo"]]
        for s in phase5["slots"]:
            if s["photo"] in hashes:
                s["input_sha256"] = hashes[s["photo"]]
        self.write(self.study.series, json.dumps(series, indent=2) + "\n")
        self.write(check_series.PHASE5_SERIES, json.dumps(phase5, indent=2) + "\n")
        self.git("init", "-q")
        self.commit("registration")
        for p in (mock.patch.object(socket.socket, "connect", no_network),
                  mock.patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})):
            p.start()
            self.addCleanup(p.stop)

    def register(self) -> None:
        """Place the study's config and series in the throwaway repository."""
        study = study_mod.load(ROOT, self.CONFIG)[0]
        for rel in study.registration_files:
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, self.repo / rel)

    # ------------------------------------------------------------ helpers

    def write(self, rel: str, text: str) -> None:
        (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / rel).write_text(text)

    def git(self, *args: str, env: dict | None = None) -> str:
        e = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        e.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        e.update(env or {})
        r = subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True, text=True, env=e)
        if r.returncode:
            raise AssertionError(r.stderr)
        return r.stdout

    def commit(self, msg: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", msg)

    def approve(self, cap: str = "1.50", commit: bool = True) -> None:
        text = (self.repo / self.study.change_md).read_text().rstrip("\n") + "\n\n" + SPEND.format(cap=cap) + "\n"
        self.write(self.study.change_md, text)
        if commit:
            self.commit("approval")

    def main(self, *args: str, fake: Fake | None = None, config: str | None = None) -> tuple[int, str, str]:
        fake = fake if fake is not None else Fake()
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(runner, "call_provider", fake), contextlib.redirect_stdout(out), \
                contextlib.redirect_stderr(err):
            code = run.main(["--config", config or self.CONFIG, *args], root=self.repo, sleep=lambda s: None)
        return code, out.getvalue(), err.getvalue()

    def rows(self) -> list[dict]:
        p = self.private / "attempts.jsonl"
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def reserves(self) -> list[dict]:
        return [r for r in self.rows() if r["event"] == "reserve"]

    def session(self, cap: float = 1.5) -> run.Session:
        return run.Session(self.paths, self.study, cap)

    def st(self) -> state.RunState:
        return self.session().reconcile()

    def status(self) -> dict[str, str]:
        return {s.label: s.status for s in self.st().slots.values()}

    def rewrite_history(self) -> tuple[str, str]:
        """Recreate every commit, the registration commit included, with the same trees in the same
        order but new SHAs (a rebase-merge's effect); check it out. Returns (old, new) registration commits."""
        reg = lambda: self.git("log", "-1", "--format=%H", "--", *self.study.registration_files).strip()  # noqa: E731
        old = reg()
        new = None
        for n, commit in enumerate(self.git("rev-list", "--reverse", "HEAD").split()):
            tree = self.git("rev-parse", f"{commit}^{{tree}}").strip()
            parent = ["-p", new] if new else []
            new = self.git("commit-tree", tree, *parent, "-m", f"rewritten {n}",
                           env={"GIT_AUTHOR_DATE": "2030-01-01T00:00:00Z",
                                "GIT_COMMITTER_DATE": "2030-01-01T00:00:00Z"}).strip()
        self.git("checkout", "-q", "-f", "--detach", new)
        return old, reg()


# ---------------------------------------------------------------- numeric budget boundaries


class NumericTest(Screen):
    def test_invalid_caps_refuse_before_any_write_or_send(self):
        self.approve()
        for cap in ("nan", "inf", "-inf", "0", "-1"):
            with self.subTest(cap=cap):
                fake = Fake(default="moderation")
                code, _, err = self.main(f"--cap={cap}", fake=fake)
                self.assertEqual((code, fake.calls), (1, []), err)
                self.assertEqual(self.rows(), [])
                self.assertFalse(self.private.exists(), "even lock/sidecar files must not be written")
                self.assertIn("finite positive", err)

    def test_both_approval_checks_reject_invalid_caps(self):
        text = "## GPT26 approvals\n" + SPEND.format(cap="1.50") + "\n"
        records = {"S19-SPEND": [{"phase": "3", "cap_usd": "1.50", "decision": "approved", "_line": "1"}]}
        for cap in (float("nan"), float("inf"), -float("inf"), 0, -1, True, False):
            with self.subTest(cap=cap):
                with self.assertRaises(run.Refused):
                    run.spend_approval(text, cap)
                with self.assertRaises(run.Refused):
                    run.protocol.check_cap(3, cap, records)

    def test_s19_cli_rejects_invalid_caps_before_reading_inputs(self):
        for cap in ("nan", "inf", "-inf", "0", "-1"):
            with self.subTest(cap=cap), mock.patch.object(run.protocol, "resolve") as resolve, \
                    contextlib.redirect_stderr(io.StringIO()) as err:
                code = runner.main(["--config", "unused", "--series", "unused", "--phase", "3", f"--cap={cap}"])
                self.assertEqual(code, 1)
                resolve.assert_not_called()
                self.assertIn("finite positive", err.getvalue())

    def test_invalid_usage_components_keep_the_full_reservation(self):
        config = json.loads((ROOT / CONFIG).read_text())
        for section, field in (("output_tokens_details", "image_tokens"),
                               ("input_tokens_details", "image_tokens"),
                               ("input_tokens_details", "text_tokens")):
            for bad in (float("nan"), float("inf"), -float("inf"), -1, True, False, "10", 10**400):
                with self.subTest(section=section, field=field, bad=bad):
                    usage = copy.deepcopy(USAGE_OK)
                    usage[section][field] = bad
                    self.assertIsNone(runner.actual_cost(config, usage))

    def test_nan_usage_cannot_release_headroom_for_extra_calls(self):
        self.approve()
        fallback = Fake(default="moderation")
        calls = []

        def fake(config, image, size):
            calls.append(image.stem)
            if len(calls) == 1:
                usage = copy.deepcopy(USAGE_OK)
                usage["output_tokens_details"]["image_tokens"] = float("nan")
                return {"http_status": 200, "output": png(size), "usage": usage}
            return fallback(config, image, size)

        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        self.assertEqual(len(calls), 7, out)
        st = self.st()
        self.assertAlmostEqual(st.committed_usd, 1.40)
        first = next(r for r in self.rows() if r["event"] == "result")
        self.assertIsNone(first["cost_usd"])
        self.assertEqual(first["status"], "ok", "keep the paid output without buying a replacement")
        self.assertEqual(runner.phase_committed(self.rows(), state.PHASE)[0], st.committed_usd)

    def test_invalid_ledger_money_blocks_reconciliation_and_resume(self):
        self.approve()
        self.main("--cap", "1.50")
        rows = self.rows()
        screen = self.session()
        for event, field in (("result", "cost_usd"), ("reserve", "reserved_usd")):
            for bad in (float("nan"), float("inf"), -float("inf"), -1, True, False, "0.01", 10**400):
                with self.subTest(event=event, field=field, bad=bad):
                    edited = copy.deepcopy(rows)
                    next(r for r in edited if r["event"] == event)[field] = bad
                    self.paths.private.joinpath("attempts.jsonl").write_text(
                        "".join(json.dumps(r) + "\n" for r in edited))
                    st = screen.reconcile()
                    self.assertEqual(st.status, "BLOCKED")
                    self.assertIn(field, " ".join(st.errors))
                    with self.assertRaises(run.Refused):
                        runner.phase_committed(edited, state.PHASE)
                    fake = Fake()
                    code, _, err = self.main("--resume", "--cap", "1.50", fake=fake)
                    self.assertEqual((code, fake.calls), (1, []), err)

    def test_admission_rejects_invalid_caps_and_bounds_before_locking(self):
        ctx = runner.RunContext(ledger_dir=self.private, output_dir=self.private, input_dir=self.inputs)
        reserve = {"event": "reserve", "attempt_id": "a", "phase": state.PHASE, "reserved_usd": 0.2}
        for context in (None, ctx):
            for bad in (float("nan"), float("inf"), -float("inf"), -1, True, False, "0.01", 10**400):
                with self.subTest(context=context, bad=bad):
                    with mock.patch.object(runner, "locked") as lock:
                        with self.assertRaises(run.Refused):
                            runner.admit(state.PHASE, bad, reserve, context)
                        lock.assert_not_called()
                        with self.assertRaises(run.Refused):
                            runner.admit(state.PHASE, 1.5, dict(reserve, reserved_usd=bad), context)
                        lock.assert_not_called()

    def test_invalid_series_and_refusal_amounts_block(self):
        screen = self.session()
        spec = screen.series["slots"][0]
        refusal = {"event": "budget_refusal", "photo": spec["photo"], "slot": spec["slot"],
                   "phase": state.PHASE, "series_id": screen.series["series_id"],
                   "config_sha256": screen.config_sha, "input_sha256": spec["input_sha256"],
                   "committed_usd": 1.40, "bound_usd": 0.20, "cap_usd": 1.50}
        for bad in (float("nan"), float("inf"), -1, False, "0.20"):
            with self.subTest(series_bound=bad):
                series = copy.deepcopy(screen.series)
                series["slots"][0]["cost_bound_usd"] = bad
                st = state.reconcile(series, screen.config, screen.config_sha, [], None, root=self.repo,
                                     study=self.study)
                self.assertEqual(st.status, "BLOCKED")
                self.assertIn("cost_bound_usd", " ".join(st.errors))
            for field in ("committed_usd", "bound_usd", "cap_usd"):
                with self.subTest(field=field, bad=bad):
                    st = screen.reconcile([dict(refusal, **{field: bad})])
                    self.assertEqual(st.status, "BLOCKED")
                    self.assertIn(field, " ".join(st.errors))


# ---------------------------------------------------------------- the paid path


class RunTest(Screen):
    def test_all_six_delivered_exit_zero(self):
        self.approve()
        code, out, err = self.main("--cap", "1.50")
        self.assertEqual(code, 0, err)
        self.assertEqual(set(self.status().values()), {"delivered"})
        self.assertEqual(len(self.reserves()), 6)
        self.assertIn("6 delivered", out)

    def test_retry_then_ok(self):
        self.approve()
        fake = Fake({"S17-03": ["moderation"]})
        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        self.assertEqual(self.status()["S17-03/1"], "delivered")
        self.assertEqual([r["ordinal"] for r in self.reserves() if r["photo"] == "S17-03" and r["slot"] == 1], [1, 2])
        self.assertEqual(len(fake.calls), 7)

    def test_block_block(self):
        self.approve()
        code, out, err = self.main("--cap", "1.50", fake=Fake({"S17-07": ["moderation", "moderation"]}))
        self.assertEqual(code, 0, err)  # every slot resolved; not a visual PASS
        st = self.st()
        slot = st.slots[("S17-07", 1)]
        self.assertEqual(slot.status, "undelivered")
        self.assertIn("technical_failure", slot.reason)
        self.assertEqual(len(slot.attempts), 2)
        self.assertEqual(st.slots[("S17-07", 2)].status, "delivered")

    def test_block_no_budget(self):
        # $1.30 cap, unknown costs keep full $0.20 reservations: five slots + one block = $1.20
        # committed when the last slot's retry asks for $0.20 more.
        self.approve("1.30")
        fake = Fake({"S17-07": ["ok-nocost", "moderation"]}, default="ok-nocost")
        code, out, err = self.main("--cap", "1.30", fake=fake)
        self.assertEqual(code, 0, err)
        st = self.st()
        last = st.slots[("S17-07", 2)]
        self.assertEqual((last.status, last.reason), ("undelivered", "not_attempted_budget"))
        self.assertEqual(len(last.attempts), 1)  # the retry was never reserved
        self.assertEqual(len(fake.calls), 6)  # ... and never sent
        self.assertLessEqual(st.committed_usd, 1.30)

    def test_later_first_attempt_unaffordable(self):
        self.approve("1.30")
        fake = Fake({"S17-03": ["moderation", "ok-nocost"]}, default="ok-nocost")
        code, out, err = self.main("--cap", "1.30", fake=fake)
        self.assertEqual(code, 0, err)
        st = self.st()
        self.assertEqual(st.slots[("S17-03", 1)].status, "delivered")
        last = st.slots[("S17-07", 2)]
        self.assertEqual((last.status, last.reason, len(last.attempts)), ("undelivered", "not_attempted_budget", 0))
        self.assertEqual(len(fake.calls), 6)

    def test_several_retries_fit_after_known_costs_release_headroom(self):
        self.approve()
        fake = Fake({"S17-03": ["moderation"], "S17-04": ["moderation", "ok", "moderation"],
                     "S17-07": ["timeout"]})
        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        st = self.st()
        self.assertEqual({s.status for s in st.slots.values()}, {"delivered"})
        self.assertEqual(sum(len(s.attempts) for s in st.slots.values()), 10)
        self.assertLessEqual(st.committed_usd, 1.50)

    def test_invalid_png_is_undelivered(self):
        self.approve()
        fake = Fake({"S17-04": ["wrong-size"]})
        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        slot = self.st().slots[("S17-04", 1)]
        self.assertEqual(slot.status, "undelivered")
        self.assertIn("invalid_output", slot.reason)
        self.assertEqual(len(slot.attempts), 1)  # an invalid output is not retried
        self.assertEqual(len(fake.calls), 6)

    def test_zero_delivered_is_a_consistent_terminal_record(self):
        self.approve()
        fake = Fake(default="moderation")
        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        st = self.st()
        self.assertTrue(st.complete)
        self.assertEqual({s.status for s in st.slots.values()}, {"undelivered"})
        # Every block keeps its full $0.20: seven reservations fit the $1.50 cap, so S17-04/2's
        # retry and both S17-07 first attempts are refused unsent.
        self.assertEqual(st.blocks["first_attempt_blocks"], 4)
        self.assertEqual(st.blocks["final_undelivered_after_block"], 4)
        self.assertEqual([st.slots[("S17-07", n)].reason for n in (1, 2)], ["not_attempted_budget"] * 2)
        self.assertEqual(len(fake.calls), 7)
        self.assertLessEqual(st.committed_usd, 1.50)

    def test_summary_counts_blocks(self):
        self.approve()
        fake = Fake({"S17-03": ["moderation"], "S17-07": ["moderation", "moderation"]})
        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        self.assertIn("moderation_blocked: 2 first-attempt block(s), 1 recovered by the retry, 1 final undelivered", out)
        self.assertIn("p95", out)
        self.assertIn("30 s guardrail", out)

    def test_distinct_input_ledger_and_output_roots(self):
        s19 = self.tmp / "s19-private"
        s19.mkdir()
        with mock.patch.dict(os.environ, {"S19_PRIVATE": str(s19)}):
            self.approve()
            code, _, err = self.main("--cap", "1.50")
        self.assertEqual(code, 0, err)
        self.assertEqual(list(s19.iterdir()), [])  # S-19's folder untouched
        self.assertTrue((self.private / "attempts.jsonl").exists())
        outputs = list((self.private / "runs").rglob("*.png"))
        self.assertEqual(len(outputs), 6)
        self.assertEqual(sorted(p.name for p in self.inputs.iterdir())[:2], ["S17-03.jpg", "S17-03.json"])
        self.assertFalse(any(p.suffix == ".png" for p in self.inputs.iterdir()))


# ---------------------------------------------------------------- refusals before any reservation


class RefusalTest(Screen):
    def assertRefusedUnreserved(self, code, err, needle):
        self.assertEqual(code, 1)
        self.assertIn(needle, err)
        self.assertEqual(self.rows(), [])
        self.assertFalse(self.paths.sidecar.exists())

    def test_cap_mismatch_refused(self):
        self.approve("1.50")
        code, _, err = self.main("--cap", "1.40")
        self.assertRefusedUnreserved(code, err, "does not match the owner-approved cap of $1.50")

    def test_missing_approval_refused(self):
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, "no GPT26-SPEND line")

    def test_missing_key_refused_before_reserve(self):
        self.approve()
        with mock.patch.dict(os.environ, {}, clear=True):
            code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, "OPENAI_API_KEY is not set")

    def test_uncommitted_approval_refused(self):
        self.approve(commit=False)
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, f"{self.study.change_md}: uncommitted changes")

    def test_git_checks_reject_committed_links_for_approval_and_viewer(self):
        for rel in (self.study.change_md, self.study.viewer):
            with self.subTest(path=rel):
                path = self.repo / rel
                source = path.with_name("fixture-copy" + path.suffix)
                path.rename(source)
                path.symlink_to(source.name)
                self.commit("fixture with aliased file")
                with self.assertRaisesRegex(run.Refused, rf"{re.escape(rel)}: Git must record a regular file"):
                    run.check_registration(self.repo, self.study)
                path.unlink()
                source.rename(path)
                self.commit("restore regular file")

    def test_checked_registration_binds_the_bytes_already_read(self):
        session = self.session()
        series = self.repo / self.study.series
        series.write_bytes(series.read_bytes() + b"\n")
        self.commit("update series in another revision")
        with self.assertRaisesRegex(run.Refused, "changed while it was being read"):
            run.check_registration(self.repo, self.study, consumed=session.consumed)

    def test_uncommitted_config_refused(self):
        self.approve()
        self.git("rm", "-q", "--cached", self.study.config)
        self.git("commit", "-q", "-m", "untrack config")
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, f"{self.study.config}: untracked")

    def test_staged_only_series_refused(self):
        self.approve()
        self.git("rm", "-q", "--cached", self.study.series)
        self.git("commit", "-q", "-m", "drop series")
        self.git("add", self.study.series)
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, f"{self.study.series}: staged but never committed")

    def test_dirty_rule_file_refused(self):
        self.approve()
        for rel in ("scripts/gpt26/state.py", "scripts/gpt26/study.py", "scripts/s19/run-candidate.py",
                    check_series.PHASE5_CONFIG, check_series.PHASE5_SERIES,
                    STUDY.viewer):
            with self.subTest(rel=rel):
                original = (self.repo / rel).read_text()
                self.write(rel, original + "\n")
                code, _, err = self.main("--cap", "1.50")
                self.assertRefusedUnreserved(code, err, f"{rel}: uncommitted changes")
                self.write(rel, original)

    def test_the_paid_runner_validates_output_directories_before_reserving(self):
        self.approve()
        outside = self.tmp / "other-private-output"
        outside.mkdir()
        self.private.mkdir()
        (self.private / "runs").symlink_to(outside, target_is_directory=True)
        fake = Fake(default="crash")
        code, _, err = self.main("--cap", "1.50", fake=fake)
        self.assertRefusedUnreserved(code, err, "unsafe write path")
        self.assertEqual(fake.calls, [])
        self.assertEqual(list(outside.iterdir()), [])

    def test_untracked_rule_file_refused(self):
        self.approve()
        self.git("rm", "-q", "--cached", "scripts/gpt26/run.py")
        self.git("commit", "-q", "-m", "untrack runner")
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, "scripts/gpt26/run.py: untracked")

    def test_dry_run_reserves_and_writes_nothing(self):
        code, out, err = self.main("--dry-run", "--cap", "1.50", fake=Fake(default="crash"))
        self.assertEqual(code, 0, err)
        self.assertIn("6 pending slot(s) bounded at $1.20", out)
        self.assertIn("a paid run would refuse — no GPT26-SPEND line", out)
        self.assertFalse(self.private.exists())

    def test_started_run_needs_resume(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-03": ["ok", "crash"]}))
        code, _, err = self.main("--cap", "1.50")
        self.assertEqual(code, 1)
        self.assertIn("pass --resume", err)


class ApprovalGrammarTest(unittest.TestCase):
    HEAD = "# c\n\n## GPT26 approvals\n\n<!--\n- GPT26-SPEND cap_usd=1.50 decision=approved date=YYYY-MM-DD\n-->\n"

    def test_one_valid_line(self):
        line = SPEND.format(cap="1.50")
        self.assertEqual(run.spend_approval(self.HEAD + line + "\n", 1.5), line)

    def test_refusals(self):
        cases = {
            "the grammar example in a comment is not a record": (self.HEAD, "no GPT26-SPEND line"),
            "no section": ("# c\n" + SPEND.format(cap="1.50") + "\n", "outside § GPT26 approvals"),
            "one decimal": (self.HEAD + "- GPT26-SPEND cap_usd=1.5 decision=approved date=2026-11-17\n", "not the grammar"),
            "extra key": (self.HEAD + SPEND.format(cap="1.50") + " note=x\n", "not the grammar"),
            "unbulleted": (self.HEAD + "GPT26-SPEND cap_usd=1.50 decision=approved date=2026-11-17\n", "not the grammar"),
            "duplicate": (self.HEAD + SPEND.format(cap="1.50") + "\n" + SPEND.format(cap="1.50") + "\n", "keep exactly one"),
            "declined": (self.HEAD + "- GPT26-SPEND cap_usd=1.50 decision=declined date=2026-11-17\n", "is declined"),
            "cap differs": (self.HEAD + SPEND.format(cap="2.00") + "\n", "does not match"),
            "a seal belongs elsewhere": (self.HEAD + "GPT26-SEAL kind=gate\n", "not the grammar"),
        }
        for name, (text, needle) in cases.items():
            with self.subTest(name):
                with self.assertRaises(run.Refused) as cm:
                    run.spend_approval(text, 1.5)
                self.assertIn(needle, str(cm.exception))

    def test_missing_section(self):
        with self.assertRaises(run.Refused) as cm:
            run.spend_approval("# c\n\n## Notes\n", 1.5)
        self.assertIn("no § GPT26 approvals", str(cm.exception))


# ---------------------------------------------------------------- shared run identity


class BindingTest(Screen):
    def complete_record(self):
        self.approve()
        code, _, err = self.main("--cap", "1.50")
        self.assertEqual(code, 0, err)
        screen = self.session()
        return screen, self.rows(), run.read_sidecar(self.paths), run.check_registration(self.repo, self.study)

    def test_missing_sidecar_blocks_a_complete_ledger(self):
        screen, rows, _, _ = self.complete_record()
        st = state.reconcile(screen.series, screen.config, screen.config_sha, rows, None,
                             root=self.repo, study=self.study, check_outputs=False)
        self.assertEqual(st.status, "BLOCKED")
        self.assertIn("sidecar is missing", " ".join(st.errors))

    def test_missing_or_false_bindings_block_the_shared_reconciler(self):
        screen, rows, good, _ = self.complete_record()
        changed = copy.deepcopy(good)
        changed["bindings"]["registration_commit"] = "0" * 40
        changed["bindings"]["files"] = {p: "0" * 40 for p in changed["bindings"]["files"]}
        for bindings in (None, {}, [], changed["bindings"]):
            with self.subTest(bindings=bindings):
                st = screen.reconcile(rows, dict(good, bindings=bindings), use_disk_sidecar=False)
                self.assertEqual(st.status, "BLOCKED")
                self.assertIn("bindings", " ".join(st.errors))

    def test_each_binding_field_and_inventory_entry_is_required(self):
        screen, rows, good, _ = self.complete_record()
        original = good["bindings"]
        cases = []
        for field in ("head", "registration_commit", "files"):
            missing = copy.deepcopy(original)
            del missing[field]
            cases.append(missing)
        for field in ("head", "registration_commit"):
            for value in ("bad", "", None, True):
                cases.append(dict(original, **{field: value}))
        for rel in original["files"]:
            missing = copy.deepcopy(original)
            del missing["files"][rel]
            cases.append(missing)
            changed = copy.deepcopy(original)
            changed["files"][rel] = "0" * 40
            cases.append(changed)
        for files in (None, [], {**original["files"], "scripts/gpt26/unregistered.py": "0" * 40}):
            cases.append(dict(original, files=files))
        for bindings in cases:
            with self.subTest(bindings=bindings):
                st = screen.reconcile(rows, dict(good, bindings=bindings), use_disk_sidecar=False)
                self.assertEqual(st.status, "BLOCKED")
                self.assertIn("bindings", " ".join(st.errors))

    def test_expected_identities_are_required_for_started_records(self):
        screen, rows, good, _ = self.complete_record()
        st = state.reconcile(screen.series, screen.config, screen.config_sha, rows, good,
                             root=self.repo, study=self.study, check_outputs=False)
        self.assertEqual(st.status, "BLOCKED")
        self.assertIn("expected bindings", " ".join(st.errors))

    def test_binding_comparison_does_not_accept_two_empty_inventories(self):
        self.assertTrue(state.check_bindings({}, {}, self.study.binding_files))
        empty = {"head": "0" * 40, "registration_commit": "0" * 40, "files": {}}
        self.assertTrue(state.check_bindings(empty, empty, ()))

    def test_the_registration_commit_and_head_are_provenance_only(self):
        screen, rows, good, current = self.complete_record()
        moved = copy.deepcopy(good)
        moved["bindings"]["registration_commit"] = "1" * 40
        moved["bindings"]["head"] = "2" * 40
        self.assertEqual(state.check_bindings(moved["bindings"], current, self.study.binding_files), [])
        st = screen.reconcile(rows, moved, use_disk_sidecar=False)
        self.assertEqual(st.status, "complete", st.errors)

    def test_resume_after_a_rewrite_that_includes_the_registration_commit(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-04": ["crash"]}))
        pinned = run.read_sidecar(self.paths)["bindings"]["registration_commit"]
        old, new = self.rewrite_history()
        self.assertEqual(old, pinned)
        self.assertNotEqual(new, old)
        code, out, err = self.main("--resume", "--cap", "1.50")
        self.assertEqual(code, 0, out + err)
        self.assertEqual(set(self.status().values()), {"delivered"})
        # ... and a changed rule blob on the rewritten history still refuses the resume.
        self.write("scripts/gpt26/gate.py", (self.repo / "scripts/gpt26/gate.py").read_text() + "\n# changed\n")
        self.commit("rule change after the rewrite")
        code, out, err = self.main("--resume", "--cap", "1.50")
        self.assertEqual(code, 1)
        self.assertIn("scripts/gpt26/gate.py", out + err)

    def test_resume_blocks_changed_sidecar_before_any_send(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-03": ["crash"]}))
        sc = run.read_sidecar(self.paths)
        sc["bindings"]["files"].pop("scripts/gpt26/state.py")
        run.write_sidecar(self.paths, sc)
        fake = Fake()
        code, out, err = self.main("--resume", "--cap", "1.50", fake=fake)
        self.assertEqual((code, fake.calls), (1, []), out + err)
        self.assertIn("bindings", out + err)
        self.assertEqual(len(self.reserves()), 1)

    def test_unrelated_head_and_mutable_notes_do_not_invalidate_identities(self):
        screen, rows, good, _ = self.complete_record()
        md = self.study.change_md
        self.write(md, (self.repo / md).read_text() + "\nBookkeeping only.\n")
        self.commit("unrelated bookkeeping after the run")
        self.write(md, (self.repo / md).read_text() + "\nUncommitted lifecycle note.\n")
        st = screen.reconcile(rows, good, use_disk_sidecar=False)
        self.assertEqual(st.status, "complete", st.errors)


# ---------------------------------------------------------------- crash, resume, bound breach


class ResumeTest(Screen):
    def test_reserve_only_crash_then_resume_uses_the_second_attempt(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-03": ["crash"]}))
        st = self.st()
        slot = st.slots[("S17-03", 1)]
        self.assertEqual((slot.status, len(slot.attempts)), ("pending", 1))
        self.assertEqual(st.committed_usd, 0.20)  # the crashed attempt keeps its full bound
        self.assertEqual(st.unknown_attempts, 1)
        code, _, err = self.main("--resume", "--cap", "1.50")
        self.assertEqual(code, 0, err)
        slot = self.st().slots[("S17-03", 1)]
        self.assertEqual((slot.status, [a["reserve"]["ordinal"] for a in slot.attempts]), ("delivered", [1, 2]))

    def test_reserve_only_crash_at_both_ordinals_is_terminal_without_a_send(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-03": ["crash"]}))
        with self.assertRaises(KeyboardInterrupt):
            self.main("--resume", "--cap", "1.50", fake=Fake({"S17-03": ["crash"]}))
        fake = Fake()
        code, _, err = self.main("--resume", "--cap", "1.50", fake=fake)
        self.assertEqual(code, 0, err)
        st = self.st()
        slot = st.slots[("S17-03", 1)]
        self.assertEqual((slot.status, len(slot.attempts)), ("undelivered", 2))
        self.assertEqual(len(fake.calls), 5)  # S17-03/1 is not sent again; the other five are
        self.assertGreaterEqual(st.unknown_attempts, 2)

    def test_resume_refuses_a_changed_rule_file(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-04": ["crash"]}))
        self.write("scripts/gpt26/state.py", (self.repo / "scripts/gpt26/state.py").read_text() + "\n# changed\n")
        self.commit("change a rule after the run started")
        code, _, err = self.main("--resume", "--cap", "1.50")
        self.assertEqual(code, 1)
        self.assertIn("changed since this run was pinned", err)
        self.assertIn("scripts/gpt26/state.py", err)

    def test_resume_refuses_a_missing_sidecar(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-04": ["crash"]}))
        self.paths.sidecar.unlink()
        code, _, err = self.main("--resume", "--cap", "1.50")
        self.assertEqual(code, 1)
        self.assertIn("is missing", err)

    def test_over_bound_first_response_stops_everything_and_persists(self):
        self.approve()
        fake = Fake({"S17-03": ["over"]})
        code, out, err = self.main("--cap", "1.50", fake=fake)
        self.assertEqual(code, 1)
        self.assertEqual(len(fake.calls), 1)
        st = self.st()
        self.assertTrue(st.breaches)
        self.assertEqual(st.slots[("S17-03", 1)].status, "delivered")  # an ok row with a breach
        self.assertEqual({s.reason for s in list(st.slots.values())[1:]}, {"stopped_after_bound_breach"})
        fake2 = Fake()
        code, _, _ = self.main("--resume", "--cap", "1.50", fake=fake2)
        self.assertEqual(code, 1)
        self.assertEqual(fake2.calls, [])

    def test_over_bound_last_response_is_a_breach_after_resume(self):
        self.approve()
        code, _, _ = self.main("--cap", "1.50", fake=Fake({"S17-07": ["ok", "over"]}))
        self.assertEqual(code, 1)
        st = self.st()
        self.assertTrue(st.complete)
        self.assertTrue(st.breaches)
        fake2 = Fake()
        code, _, _ = self.main("--resume", "--cap", "1.50", fake=fake2)
        self.assertEqual(code, 1)
        self.assertEqual(fake2.calls, [])

    def test_admission_rechecks_inside_the_lock(self):
        self.approve()
        code, _, _ = self.main("--cap", "1.50", fake=Fake({"S17-03": ["over"]}))
        screen = self.session()
        with self.assertRaises(run.Refused) as cm:
            runner.admit(state.PHASE, 1.5, {"photo": "S17-04", "slot": 1, "reserved_usd": 0.2}, screen.ctx)
        self.assertIn("exceeded its cost bound", str(cm.exception))


# ---------------------------------------------------------------- terminal evidence


class TerminalTest(Screen):
    def screen_and_sidecar(self):
        self.approve()
        screen = self.session()
        return screen, screen.new_sidecar(run.check_registration(self.repo, self.study))

    def test_unsupported_sidecar_terminals_block_without_sending(self):
        screen, sc = self.screen_and_sidecar()
        for reason in ("stopped_after_bound_breach", "not_attempted_budget"):
            with self.subTest(reason=reason):
                sc["terminal"] = [{"photo": s["photo"], "slot": s["slot"], "status": "undelivered",
                                   "reason": reason} for s in screen.series["slots"]]
                run.write_sidecar(self.paths, sc)
                fake = Fake()
                code, out, err = self.main("--resume", "--cap", "1.50", fake=fake)
                self.assertEqual((code, fake.calls), (1, []), out + err)
                self.assertEqual(screen.reconcile().status, "BLOCKED")
                self.assertIn("supporting", out + err)

    def test_technical_terminal_requires_a_failed_attempt_history(self):
        screen, sc = self.screen_and_sidecar()
        spec = screen.series["slots"][0]
        common = {"phase": state.PHASE, "series_id": screen.series["series_id"],
                  "config_sha256": screen.config_sha, "input_sha256": spec["input_sha256"],
                  "photo": spec["photo"], "slot": spec["slot"]}
        reserve = dict(common, event="reserve", attempt_id="a", ordinal=1,
                       reserved_usd=0.2, request_size=spec["request_size"])
        terminal = dict(common, event="slot_terminal", status="technical_failure", reason="claimed failure")
        for rows in ([terminal], [reserve, terminal],
                     [reserve, {"event": "result", "attempt_id": "a", "status": "error", "transient": True}, terminal]):
            with self.subTest(rows=rows):
                st = screen.reconcile(rows, sc, use_disk_sidecar=False)
                self.assertEqual(st.status, "BLOCKED")
                self.assertIn("supporting", " ".join(st.errors))

    def budget_record(self):
        self.approve("0.30")
        self.main("--cap", "0.30", fake=Fake(default="ok-nocost"))
        return self.session(0.3), self.rows(), run.read_sidecar(self.paths)

    def test_budget_refusal_must_match_historical_cost_bound_and_cap(self):
        screen, rows, sc = self.budget_record()
        self.assertTrue(screen.reconcile().complete)
        for field, value in (("committed_usd", 0.0), ("bound_usd", 0.01), ("cap_usd", 1.50)):
            with self.subTest(field=field):
                edited = copy.deepcopy(rows)
                next(r for r in edited if r["event"] == "budget_refusal")[field] = value
                st = screen.reconcile(edited, sc, use_disk_sidecar=False)
                self.assertEqual(st.status, "BLOCKED")
                self.assertIn("budget_refusal", " ".join(st.errors))

    def test_valid_budget_refusal_survives_later_cost_release(self):
        screen, rows, sc = self.budget_record()
        result = next(r for r in rows if r["event"] == "result")
        rows.remove(result)
        rows.append(dict(result, cost_usd=0.01))
        # The first response remained unknown when the $0.20 reservation prevented another
        # $0.20 call under the $0.30 cap. Its result arrived only after those refusals.
        st = screen.reconcile(rows, sc, use_disk_sidecar=False)
        self.assertEqual(st.status, "complete", st.errors)
        self.assertAlmostEqual(st.committed_usd, 0.01)

    def test_resume_finalizes_a_budget_refusal_without_buying_another_attempt(self):
        screen, rows, sc = self.budget_record()
        sc["terminal"] = []  # interruption after durable refusal, before sidecar terminal write
        run.write_sidecar(self.paths, sc)
        fake = Fake()
        code, out, err = self.main("--resume", "--cap", "0.30", fake=fake)
        self.assertEqual((code, fake.calls), (0, []), out + err)
        self.assertTrue(screen.reconcile().complete)
        self.assertEqual(len(self.reserves()), 1)

    def test_budget_refusal_is_written_under_the_admission_lock(self):
        screen, sc = self.screen_and_sidecar()
        run.write_sidecar(self.paths, sc)
        spec = screen.series["slots"][0]
        reserve = dict(spec, event="reserve", attempt_id="a", ordinal=1, phase=state.PHASE,
                       series_id=screen.series["series_id"], reserved_usd=0.2)
        held = []
        real_lock, real_append = runner.locked, runner.append

        @contextlib.contextmanager
        def locked(ctx=None):
            with real_lock(ctx):
                held.append(True)
                try:
                    yield
                finally:
                    held.pop()

        def append(row, ctx=None):
            self.assertTrue(held, "refusal and decision must share the same locked history")
            real_append(row, ctx)

        with mock.patch.object(runner, "locked", locked), mock.patch.object(runner, "append", append):
            admitted, _ = runner.admit(state.PHASE, 0.1, reserve, screen.ctx)
        self.assertFalse(admitted)
        self.assertEqual([r["event"] for r in self.rows()], ["budget_refusal"])


# ---------------------------------------------------------------- offline run report


class ReportTest(Screen):
    def record_bytes(self) -> dict:
        return {p: p.read_bytes() for p in (self.private / "attempts.jsonl", self.paths.sidecar) if p.exists()}

    def report(self, *extra: str, fake: Fake | None = None) -> tuple[int, str, str, str | None]:
        fake = fake if fake is not None else Fake(default="crash")
        code, out, err = self.main("--cap", "1.50", "--report", *extra, fake=fake)
        self.assertEqual(fake.calls, [], "--report must never call the provider")
        target = self.repo / self.study.run_report
        return code, out, err, target.read_text(encoding="utf-8") if target.exists() else None

    def test_report_of_an_undelivered_slot_and_an_unknown_reservation(self):
        self.approve()
        code, _, err = self.main("--cap", "1.50", fake=Fake({"S17-07": ["moderation", "moderation"],
                                                             "S17-04": ["ok-nocost"]}))
        self.assertEqual(code, 0, err)
        before = self.record_bytes()
        with mock.patch.dict(os.environ, {}, clear=True):  # no API key needed
            code, out, err, md = self.report()
        self.assertEqual(code, 0, out + err)
        self.assertEqual(self.record_bytes(), before, "the ledger and the sidecar are never written")
        table = {c[0]: c for c in ([x.strip() for x in ln.strip("|").split("|")] for ln in md.splitlines()
                                   if ln.startswith("| S17-"))}
        self.assertEqual(sorted(table), sorted(STUDY.labels))
        # Slot, size, bound, status, terminal reason, attempts, without known cost, wall times.
        self.assertEqual(table["S17-04/1"][3:7], ["delivered", "—", "1", "1"])
        self.assertEqual(table["S17-03/1"][3:7], ["delivered", "—", "1", "0"])
        self.assertEqual(table["S17-07/1"][3], "undelivered")
        self.assertTrue(table["S17-07/1"][4].startswith("technical_failure"))
        self.assertEqual(table["S17-07/1"][5:7], ["2", "2"])
        self.assertEqual(len(table["S17-07/1"][7].split(", ")), 2)
        self.assertIn("- Record: **complete**.", md)
        self.assertIn("moderation_blocked: 1 first-attempt block(s), 0 recovered by the retry, 1 final undelivered", md)
        # S17-04/1's unknown cost and S17-07/1's two blocks keep their full reservations.
        self.assertIn("- Unknown reservations: 3 attempt(s) without a known cost", md)
        st = self.st()
        self.assertIn(f"- Known billed: ${st.known_usd:.4f}.", md)
        self.assertIn(f"- Conservative: ${st.committed_usd:.2f} (known cost, else the full reservation) of the $1.50 cap"
                      " — within the cap.", md)
        self.assertIn("vs the 30 s guardrail (diagnostic only)", md)
        self.assertIn("- Every slot resolved; no inconsistency and no cost-bound breach.", md)
        self.assertIn(f"`{SPEND.format(cap='1.50')}`", md)
        code, _, _, again = self.report()
        self.assertEqual((code, again), (0, md), "a rerun writes the same bytes")

    def test_report_names_an_unresolved_and_a_breached_state(self):
        self.approve()
        with self.assertRaises(KeyboardInterrupt):
            self.main("--cap", "1.50", fake=Fake({"S17-04": ["crash"]}))
        code, out, err, md = self.report()
        self.assertEqual(code, 0, out + err)
        self.assertIn("- Record: **incomplete**.", md)
        self.assertIn("- Unresolved: S17-04/1, S17-04/2, S17-07/1, S17-07/2.", md)
        self.assertIn("| S17-04/1 ", md)
        self.assertIn("unresolved", md)
        self.main("--resume", "--cap", "1.50", fake=Fake({"S17-04": ["over"]}))
        code, out, err, md = self.report()
        self.assertEqual(code, 0, out + err)
        self.assertIn("BREACHED", md)
        self.assertIn("above its bound", md)
        self.assertIn("stopped_after_bound_breach", md)

    def test_report_of_a_blocked_record_without_approval(self):
        self.approve()
        self.main("--cap", "1.50")
        rows = self.rows()
        rows.append({"event": "mystery"})
        (self.private / "attempts.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
        self.write(self.study.change_md, CHANGE_MD)  # the approval line removed (uncommitted)
        code, out, err, md = self.report()
        self.assertEqual(code, 0, out + err)
        self.assertIn("- Record: **BLOCKED**.", md)
        self.assertIn("- BLOCKED: ledger row", md)
        self.assertIn("- Approval: not usable for --cap 1.50", md)

    def test_report_labels_unverified_registration_and_approval_without_sidecar(self):
        self.approve(commit=False)
        series = self.repo / self.study.series
        series.write_bytes(series.read_bytes() + b"\n")
        code, out, err, md = self.report()
        self.assertEqual(code, 0, out + err)
        self.assertIn("- Record: **BLOCKED**.", md)
        self.assertIn("registration provenance could not be verified", md)
        self.assertIn("- Approval: not usable for --cap 1.50", md)
        self.assertNotIn("decision=approved", md)
        self.assertFalse(self.private.exists())

    def test_report_is_exclusive_with_dry_run_and_resume(self):
        self.approve()
        for other in ("--dry-run", "--resume"):
            with self.subTest(other=other), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as cm:
                    self.main("--cap", "1.50", "--report", other)
                self.assertEqual(cm.exception.code, 2)
        self.assertFalse((self.repo / self.study.run_report).exists())

    def test_report_refuses_a_target_outside_the_change(self):
        outside = self.tmp / "elsewhere"
        outside.mkdir()
        os.symlink(outside, self.repo / self.study.eval_dir)
        code, out, err, _ = self.report()
        self.assertEqual(code, 1)
        self.assertIn("no report written", err)
        self.assertEqual(list(outside.iterdir()), [])

    def test_report_refuses_a_symlink_even_within_the_change(self):
        approval = self.repo / self.study.change_md
        original = approval.read_bytes()
        target = self.repo / self.study.run_report
        target.parent.mkdir()
        target.symlink_to(approval)
        code, _, err, _ = self.report()
        self.assertEqual(code, 1)
        self.assertIn("no report written", err)
        self.assertEqual(approval.read_bytes(), original)


# ---------------------------------------------------------------- reconciliation


class ReconcileTest(Screen):
    def recon(self, rows, sidecar=None, check_outputs=False):
        screen = self.session()
        sidecar = run.read_sidecar(self.paths) if sidecar is None else sidecar
        return state.reconcile(screen.series, screen.config, screen.config_sha, rows, sidecar,
                               root=self.repo, study=self.study, check_outputs=check_outputs,
                               expected_bindings=run.check_registration(self.repo, self.study))

    def base_rows(self):
        self.approve()
        self.main("--cap", "1.50", fake=Fake({"S17-03": ["moderation"]}))
        return self.rows()

    def test_a_complete_record_reconciles(self):
        st = self.recon(self.base_rows(), check_outputs=True)
        self.assertEqual(st.status, "complete")

    def test_inconsistencies_block(self):
        rows = self.base_rows()
        reserve = next(r for r in rows if r["event"] == "reserve" and r["photo"] == "S17-04")
        result = next(r for r in rows if r["event"] == "result" and r["attempt_id"] == reserve["attempt_id"])
        cases = {
            "duplicate reserve": rows + [dict(reserve)],
            "foreign slot": rows + [dict(reserve, attempt_id="x1", photo="S17-01")],
            "foreign config": rows + [dict(reserve, attempt_id="x2", slot=2, config_sha256="0" * 64)],
            "result without reservation": rows + [dict(result, attempt_id="nobody")],
            "second result": rows + [dict(result)],
            "reserve after delivery": rows + [dict(reserve, attempt_id="x3", ordinal=2)],
            "three reservations": rows + [dict(reserve, attempt_id=f"x{i}", ordinal=i, photo="S17-07", slot=2)
                                          for i in (5, 6, 7)],
            "wrong bound": rows + [dict(reserve, attempt_id="x8", slot=2, photo="S17-07", reserved_usd=0.05)],
            "unknown event": rows + [{"event": "mystery"}],
        }
        for name, case in cases.items():
            with self.subTest(name):
                self.assertEqual(self.recon(case).status, "BLOCKED")

    def test_missing_slot_in_series_blocks(self):
        screen = self.session()
        series = copy.deepcopy(screen.series)
        series["slots"] = series["slots"][:5]
        st = state.reconcile(series, screen.config, screen.config_sha, [], None, root=self.repo, study=self.study)
        self.assertEqual(st.status, "BLOCKED")
        series["slots"] = series["slots"][:4] + [series["slots"][0]]
        st = state.reconcile(series, screen.config, screen.config_sha, [], None, root=self.repo, study=self.study)
        self.assertIn("registered twice", " ".join(st.errors))

    def test_unknown_cost_keeps_the_full_reservation(self):
        rows = self.base_rows()
        st = self.recon(rows)
        self.assertEqual(st.unknown_attempts, 1)  # the moderation block
        self.assertAlmostEqual(st.committed_usd, 0.20 + st.known_usd, places=6)

    def test_tampered_output_blocks(self):
        rows = self.base_rows()
        out = next(r for r in rows if r["event"] == "result" and r.get("status") == "ok")
        Path(out["output_path"]).write_bytes(png((10, 10)))
        st = self.recon(rows, check_outputs=True)
        self.assertEqual(st.status, "BLOCKED")
        self.assertIn("no longer hashes", " ".join(st.errors))

    def test_pending_is_legal_before_running(self):
        st = self.recon([])
        self.assertEqual((st.status, len(st.pending()), st.open_bound()), ("incomplete", 6, 1.2))

    def test_sidecar_terminal_records_are_validated(self):
        rows = self.base_rows()
        screen = self.session()
        good = screen.new_sidecar(run.check_registration(self.repo, self.study))
        for name, term in {"delivered slot": {"photo": "S17-04", "slot": 1, "status": "undelivered",
                                              "reason": "not_attempted_budget"},
                           "foreign slot": {"photo": "S17-01", "slot": 1, "status": "undelivered",
                                            "reason": "not_attempted_budget"},
                           "unknown reason": {"photo": "S17-04", "slot": 1, "status": "undelivered",
                                              "reason": "felt like it"}}.items():
            with self.subTest(name):
                self.assertEqual(self.recon(rows, dict(good, terminal=[term])).status, "BLOCKED")


# ---------------------------------------------------------------- S-19 hooks and compatibility


class HookTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / CONFIG).read_text())
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.image = Path(tmp.name) / "in.jpg"
        Image.new("RGB", (64, 48)).save(self.image, format="JPEG")

    def sent_fields(self, config) -> list[tuple[str, str]]:
        captured = {}

        def http(method, url, headers, body, timeout):
            captured["body"], captured["ctype"] = body, headers["Content-Type"]
            return 400, b'{"error": {"code": "x"}}'

        with mock.patch.object(runner, "http", http), mock.patch.dict(os.environ, {"OPENAI_API_KEY": "k"}):
            runner.call_provider(config, self.image, (2336, 1552))
        boundary = captured["ctype"].split("boundary=")[1].encode()
        fields = []
        for part in captured["body"].split(b"--" + boundary)[1:-1]:
            head, _, value = part.partition(b"\r\n\r\n")
            name = head.split(b'name="')[1].split(b'"')[0].decode()
            fields.append((name, value[:-2].decode(errors="replace") if name != "image" else "<image>"))
        return fields

    def test_request_fields_sent(self):
        fields = dict(self.sent_fields(self.config))
        self.assertEqual((fields["complexity"], fields["moderation"]), ("low", "auto"))

    def test_no_request_fields_unchanged(self):
        config = {k: v for k, v in self.config.items() if k != "request_fields"}
        self.assertEqual([n for n, _ in self.sent_fields(config)],
                         ["model", "prompt", "size", "quality", "output_format", "n", "image"])

    def test_every_reserved_key_collision_and_bad_value_is_refused(self):
        for key in sorted(runner.RUNNER_FIELDS):
            with self.subTest(key=key):
                with self.assertRaises(runner.protocol.Refused):
                    runner.request_fields(dict(self.config, request_fields={key: "x"}))
        for value in (True, None, [1], {"a": 1}, float("nan")):
            with self.subTest(value=value):
                with self.assertRaises(runner.protocol.Refused):
                    runner.request_fields(dict(self.config, request_fields={"complexity": value}))
        with self.assertRaises(runner.protocol.Refused):
            runner.request_fields(dict(self.config, kind="nafnet"))

    def test_collision_is_refused_before_any_reservation(self):
        ledger = Path(tempfile.mkdtemp(dir=self.image.parent))
        ctx = runner.RunContext(ledger_dir=ledger, output_dir=ledger, input_dir=ledger)
        bad = dict(self.config, request_fields={"model": "other"})
        spec = {"photo": "S17-03", "slot": 1, "input": "common", "input_sha256": "0" * 64,
                "request_size": [2336, 1552], "cost_bound_usd": 0.2}
        with self.assertRaises(runner.protocol.Refused):
            runner.check_slot_frozen(bad, spec, {"sha256": "0" * 64, "dimensions": [3840, 2560]})
        self.assertEqual(list(ledger.iterdir()), [])
        self.assertIsNone(ctx.admission_check)

    def test_default_context_keeps_s19_paths_and_approval(self):
        ctx = runner.default_context()
        self.assertIs(ctx.approve, runner.protocol.check_cap)
        self.assertEqual(ctx.ledger_dir, runner.protocol.private_dir())
        self.assertEqual(ctx.input_dir, runner.protocol.private_dir() / "inputs")
        self.assertTrue(ctx.invalid_output_is_transient)
        self.assertIsNone(ctx.admission_check)

    def test_imports_without_fcntl_and_locks_refuse_clearly(self):
        with mock.patch.dict(sys.modules, {"fcntl": None}):
            mod = load("s19_run_candidate_nofcntl", ROOT / "scripts" / "s19" / "run-candidate.py")
        self.assertIsNone(mod.fcntl)
        ctx = mod.RunContext(ledger_dir=self.image.parent, output_dir=self.image.parent, input_dir=self.image.parent)
        for lock in (lambda: mod.locked(ctx), lambda: mod.slot_lock(("a", "b", "c", 1), ctx)):
            with self.assertRaises(mod.protocol.Refused) as cm:
                with lock():
                    pass
            self.assertIn("fcntl", str(cm.exception))

    def test_checker_and_runner_bound_formulas_agree(self):
        rule = self.config["size_rule"]
        for w, h in [(3840, 2560), (4000, 3000), (2560, 1440), (1280, 1280), (5000, 2000), (1024, 768), (3000, 4500)]:
            with self.subTest(size=(w, h)):
                mine = check_series.request_size(w, h, rule)
                try:
                    theirs = runner.request_size(w, h, rule)
                except runner.protocol.Refused:
                    theirs = None
                self.assertEqual(mine, theirs)
                if mine:
                    self.assertEqual(check_series.cost_bound(self.config, mine), runner.cost_bound(self.config, mine))


class IdentityTest(unittest.TestCase):
    def test_git_root_ignores_test_only_and_git_overrides(self):
        bogus = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, bogus)
        with mock.patch.dict(os.environ, {"GIT_DIR": bogus, "GIT_WORK_TREE": bogus, "S19_PRIVATE": bogus}):
            self.assertEqual(run.git_root(ROOT), ROOT.resolve())
            paths = run.study_paths(ROOT, STUDY)
        self.assertEqual(paths.root, ROOT)
        self.assertEqual(paths.private, ROOT / "test-photos" / "private" / "gpt26")
        self.assertEqual(paths.inputs, ROOT / "test-photos" / "private" / "s19" / "inputs")

    def test_rule_inventory_covers_every_imported_runtime_file(self):
        code = ("import sys, json; sys.argv=['x']; sys.path.insert(0, 'scripts/gpt26');"
                "import importlib.util as u; s=u.spec_from_file_location('r','scripts/gpt26/run.py');"
                "m=u.module_from_spec(s); s.loader.exec_module(m); import blind, gate;"
                "print(json.dumps(sorted({str(getattr(v,'__file__','') or '') for v in list(sys.modules.values())})))")
        r = subprocess.run([sys.executable, "-B", "-c", code], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        loaded = {Path(f).resolve().relative_to(ROOT).as_posix() for f in json.loads(r.stdout)
                  if f and Path(f).resolve().is_relative_to(ROOT / "scripts")}
        self.assertTrue(loaded, "nothing under scripts/ was imported")
        self.assertLessEqual(loaded, set(STUDY.rule_files))
        # The builder, the gate, the study descriptor and the S-20 modules they import are among
        # them (the runner is loaded from its file path, outside sys.modules, and pinned explicitly).
        self.assertLessEqual({"scripts/gpt26/blind.py", "scripts/gpt26/gate.py", "scripts/gpt26/study.py",
                              "scripts/s20/evidence.py", "scripts/s20/trials.py"}, loaded)
        # Every study pins its own viewer in place of another study's.
        self.assertIn(STUDY.viewer, STUDY.rule_files)
        self.assertFalse(any("gpt-image-26-screen" in f for f in STUDY.rule_files))


if __name__ == "__main__":
    unittest.main()
