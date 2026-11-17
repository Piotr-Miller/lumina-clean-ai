"""run.py and state.py offline: a fake provider, synthetic inputs and PNGs, a throwaway Git repo.

Nothing here reads the private corpus, a provider key or the network (a socket guard fails any
real connection). Each test builds its own repository holding copies of the registration and
rule files, with the series' input hashes rebound to generated images, and drives the runner
through `run.main(argv, paths=...)`.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
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
    """A throwaway repository with the registration rebound to synthetic inputs."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.repo = self.tmp / "repo"
        self.inputs = self.tmp / "inputs"
        self.private = self.tmp / "private"
        self.inputs.mkdir()
        for rel in (*state.REGISTRATION_FILES, *state.RULE_FILES, run.CHANGE_MD,
                    check_series.PHASE5_CONFIG, check_series.PHASE5_SERIES):
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, self.repo / rel)
        series = json.loads((ROOT / run.SERIES).read_text())
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
        self.write(run.SERIES, json.dumps(series, indent=2) + "\n")
        self.write(check_series.PHASE5_SERIES, json.dumps(phase5, indent=2) + "\n")
        self.git("init", "-q")
        self.commit("registration")
        self.paths = run.Paths(self.repo, self.private, self.inputs)
        for p in (mock.patch.object(socket.socket, "connect", no_network),
                  mock.patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})):
            p.start()
            self.addCleanup(p.stop)

    # ------------------------------------------------------------ helpers

    def write(self, rel: str, text: str) -> None:
        (self.repo / rel).write_text(text)

    def git(self, *args: str) -> str:
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        env.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        r = subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True, text=True, env=env)
        if r.returncode:
            raise AssertionError(r.stderr)
        return r.stdout

    def commit(self, msg: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", msg)

    def approve(self, cap: str = "1.50", commit: bool = True) -> None:
        text = (self.repo / run.CHANGE_MD).read_text().rstrip("\n") + "\n\n" + SPEND.format(cap=cap) + "\n"
        self.write(run.CHANGE_MD, text)
        if commit:
            self.commit("approval")

    def main(self, *args: str, fake: Fake | None = None) -> tuple[int, str, str]:
        fake = fake if fake is not None else Fake()
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(runner, "call_provider", fake), contextlib.redirect_stdout(out), \
                contextlib.redirect_stderr(err):
            code = run.main(list(args), paths=self.paths, sleep=lambda s: None)
        return code, out.getvalue(), err.getvalue()

    def rows(self) -> list[dict]:
        p = self.private / "attempts.jsonl"
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def reserves(self) -> list[dict]:
        return [r for r in self.rows() if r["event"] == "reserve"]

    def st(self) -> state.RunState:
        screen = run.Screen(self.paths, 1.5)
        return screen.reconcile()

    def status(self) -> dict[str, str]:
        return {s.label: s.status for s in self.st().slots.values()}


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
        self.assertRefusedUnreserved(code, err, f"{run.CHANGE_MD}: uncommitted changes")

    def test_uncommitted_config_refused(self):
        self.approve()
        self.git("rm", "-q", "--cached", run.CONFIG)
        self.git("commit", "-q", "-m", "untrack config")
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, f"{run.CONFIG}: untracked")

    def test_staged_only_series_refused(self):
        self.approve()
        self.git("rm", "-q", "--cached", run.SERIES)
        self.git("commit", "-q", "-m", "drop series")
        self.git("add", run.SERIES)
        code, _, err = self.main("--cap", "1.50")
        self.assertRefusedUnreserved(code, err, f"{run.SERIES}: staged but never committed")

    def test_dirty_rule_file_refused(self):
        self.approve()
        for rel in ("scripts/gpt26/state.py", "scripts/s19/run-candidate.py"):
            with self.subTest(rel=rel):
                original = (self.repo / rel).read_text()
                self.write(rel, original + "\n# edited\n")
                code, _, err = self.main("--cap", "1.50")
                self.assertRefusedUnreserved(code, err, f"{rel}: uncommitted changes")
                self.write(rel, original)

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
        screen = run.Screen(self.paths, 1.5)
        with self.assertRaises(run.Refused) as cm:
            runner.admit(state.PHASE, 1.5, {"photo": "S17-04", "slot": 1, "reserved_usd": 0.2}, screen.ctx)
        self.assertIn("exceeded its cost bound", str(cm.exception))


# ---------------------------------------------------------------- reconciliation


class ReconcileTest(Screen):
    def recon(self, rows, sidecar=None, check_outputs=False):
        screen = run.Screen(self.paths, 1.5)
        return state.reconcile(screen.series, screen.config, screen.config_sha, rows, sidecar,
                               root=self.repo, check_outputs=check_outputs)

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
        screen = run.Screen(self.paths, 1.5)
        series = copy.deepcopy(screen.series)
        series["slots"] = series["slots"][:5]
        st = state.reconcile(series, screen.config, screen.config_sha, [], None, root=self.repo)
        self.assertEqual(st.status, "BLOCKED")
        series["slots"] = series["slots"][:4] + [series["slots"][0]]
        st = state.reconcile(series, screen.config, screen.config_sha, [], None, root=self.repo)
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
        screen = run.Screen(self.paths, 1.5)
        good = screen.new_sidecar({"files": {}})
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
        self.config = json.loads((ROOT / run.CONFIG).read_text())
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
            paths = run.default_paths()
        self.assertEqual(paths.root, ROOT)
        self.assertEqual(paths.private, ROOT / "test-photos" / "private" / "gpt26")
        self.assertEqual(paths.inputs, ROOT / "test-photos" / "private" / "s19" / "inputs")

    def test_rule_inventory_covers_every_imported_runtime_file(self):
        code = ("import sys, json; sys.argv=['x']; sys.path.insert(0, 'scripts/gpt26');"
                "import importlib.util as u; s=u.spec_from_file_location('r','scripts/gpt26/run.py');"
                "m=u.module_from_spec(s); s.loader.exec_module(m);"
                "print(json.dumps(sorted({str(getattr(v,'__file__','') or '') for v in list(sys.modules.values())})))")
        r = subprocess.run([sys.executable, "-B", "-c", code], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        loaded = {Path(f).resolve().relative_to(ROOT).as_posix() for f in json.loads(r.stdout)
                  if f and Path(f).resolve().is_relative_to(ROOT / "scripts")}
        self.assertTrue(loaded, "nothing under scripts/ was imported")
        self.assertLessEqual(loaded, set(state.RULE_FILES))


if __name__ == "__main__":
    unittest.main()
