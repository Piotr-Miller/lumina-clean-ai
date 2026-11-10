"""S-20 step 1a, plan Phase 4 item 4: `pointers.py`, the status pointers checked block by block."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

S20 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(S20))

import pointers  # noqa: E402

LINK = "[verdict](context/changes/cloud-classical-denoise/evaluations/step1-gate.md)"

# Mirrors the real layout: S-20 is the last H3 of its H2, followed directly by `## Backlog Handoff`;
# S-15 keeps its `on hold`, which is not S-20's business [F15].
ROADMAP = """# Roadmap

## Slices

### S-15: Localization

- **Status:** on hold — deliberately (user decision).

### S-20: Cloud AI as a classical full-resolution denoise pipeline

- **Outcome:** a better Cloud path.
- **Change ID:** cloud-classical-denoise
- **Prerequisites:** S-19

Some prose about the slice, several lines long,
so that the status line sits apart from the heading and the change id.

- **Status:** {status}

## Backlog Handoff

| ID | Change | Title | Status | Notes |
| -- | ------ | ----- | ------ | ----- |
| S-15 | localization | Localization | on hold | waits |
| S-20 | cloud-classical-denoise | Classical Cloud | {row} |
"""
TEMP = """# Kroki

## Teraz

{teraz}

## Potem

- on hold: something else entirely
"""
CHANGE = """# change

### Sequence (owner-accepted)

1. **Denoising alone.** {step1}
   Continued detail of step one.
2. **Tone mapping**, proposed only after step 1 passes.

### Not in scope
"""

CURRENT = {"status": f"done — step 1 verdict: {LINK}", "row": f"done | {LINK}",
           "teraz": f"S-20 step 1 decided: {LINK}", "step1": f"Verdict: {LINK}."}


class PointersTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="s20-pointers-"))
        self.addCleanup(shutil.rmtree, self.root, True)

    def write(self, **over) -> None:
        v = {**CURRENT, **over}
        for rel, text in ((pointers.ROADMAP, ROADMAP.format(**v)), (pointers.TEMP, TEMP.format(**v)),
                          (pointers.CHANGE, CHANGE.format(**v))):
            (self.root / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.root / rel).write_text(text)

    def run_cli(self) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(S20 / "pointers.py"), "--root", str(self.root)],
                              capture_output=True, text=True)

    def test_all_current_passes_while_s15_keeps_on_hold(self):
        self.write()
        r = self.run_cli()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("all 4 S-20 pointers", r.stdout)

    def test_the_s20_section_ends_at_the_next_h2(self):
        self.write()
        text = (self.root / pointers.ROADMAP).read_text()
        block = pointers.blocks(self.root)[0][2]
        self.assertTrue(block.startswith("### S-20"))
        self.assertNotIn("Backlog Handoff", block)
        self.assertNotIn("S-15", block)
        self.assertIn("## Backlog Handoff", text)

    def test_a_stale_status_line_apart_from_its_heading_is_found(self):
        self.write(status="proposed — registered 2026-11-03")
        r = self.run_cli()
        self.assertEqual(r.returncode, 1)
        self.assertIn("### S-20 section", r.stdout)
        self.assertIn("'proposed'", r.stdout)
        self.assertIn("- **Status:** proposed", r.stdout, "names the wording found")

    def test_each_block_is_checked_on_its_own(self):
        cases = {"row": ("proposed | no link yet", "Backlog Handoff row"),
                 "teraz": ("S-20 NIE rozpoczęte", "## Teraz"),
                 "step1": ("planning the NLM trial", "### Sequence step 1")}
        for field, (value, block) in cases.items():
            with self.subTest(block=block):
                self.write(**{field: value})
                r = self.run_cli()
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn(block, r.stdout)
                self.assertEqual(r.stdout.count(f"({block})"), 2, "no link and an old wording, in this block only")

    def test_old_wording_in_another_step_of_the_sequence_is_not_this_checks_business(self):
        self.write()
        self.assertEqual(self.run_cli().returncode, 0, "step 2's 'proposed' stays outside step 1's block")

    def test_a_missing_block_is_exit_2(self):
        self.write()
        path = self.root / pointers.TEMP
        path.write_text(path.read_text().replace("## Teraz", "## Now"))
        r = self.run_cli()
        self.assertEqual(r.returncode, 2)
        self.assertIn("## Teraz", r.stderr)

    def test_an_unreadable_file_is_exit_2(self):
        self.write()
        (self.root / pointers.CHANGE).unlink()
        self.assertEqual(self.run_cli().returncode, 2)

    def test_the_real_files_have_all_four_blocks(self):
        """The selectors fit this repository's real layout (the verdict itself is Phase 6's)."""
        found = pointers.blocks(S20.parents[1])
        self.assertEqual([name for _, name, _ in found],
                         ["### S-20 section", "Backlog Handoff row", "## Teraz", "### Sequence step 1"])


STEP1B = "context/changes/cloud-classical-denoise/evaluations/step1b"
LINK_1B = {"gate": "[1b verdict](context/changes/cloud-classical-denoise/evaluations/step1b/gate.md)",
           "stop": "[1b STOP](context/changes/cloud-classical-denoise/evaluations/step1b/pilot-stop.md)"}


class Trial1bPointersTest(unittest.TestCase):
    """`--trial 1b` (plan Phase 8, F22, F29): each block also links the 1b outcome, chosen by the
    1b pilot result, and that outcome is decided (PASS or FAIL, or a STOP report saying STOP)."""

    setUp, write, run_cli = PointersTest.setUp, PointersTest.write, PointersTest.run_cli

    def outcome(self, pilot: str, gate: str | None = None, stop: bool = False) -> None:
        d = self.root / STEP1B
        d.mkdir(parents=True, exist_ok=True)
        (d / "pilot-result.json").write_text(json.dumps({"verdict": pilot}))
        if gate:
            (d / "gate.md").write_text(f"# S-20 step 1b — gate verdict\n\n**Verdict: {gate}.** Wins …\n")
        if stop:
            (d / "pilot-stop.md").write_text("# S-20 step 1b — pilot STOP\n\n**Verdict: STOP.** No strength …\n")

    def write_1b(self, which: str, **over) -> None:
        link = LINK_1B[which]
        v = {"status": f"done — step 1 closed: {LINK} then {link}", "row": f"done | {LINK} {link}",
             "teraz": f"S-20 step 1 closed: {LINK}, {link}", "step1": f"Verdict: {LINK}; {link}."}
        self.write(**{**v, **over})

    def run_1b(self) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(S20 / "pointers.py"), "--root", str(self.root),
                               "--trial", "1b"], capture_output=True, text=True)

    def test_a_decided_gate_linked_from_every_block_passes(self):
        for verdict in ("PASS", "FAIL"):
            with self.subTest(verdict=verdict):
                self.outcome("SELECTED", gate=verdict)
                self.write_1b("gate")
                r = self.run_1b()
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                self.assertIn("evaluations/step1b/gate.md", r.stdout)

    def test_a_block_without_the_1b_link_fails(self):
        self.outcome("SELECTED", gate="FAIL")
        self.write_1b("gate", teraz=f"S-20 step 1 decided: {LINK}")
        r = self.run_1b()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("(## Teraz): no link to evaluations/step1b/gate.md", r.stdout)

    def test_a_blocked_gate_md_is_no_verdict(self):
        self.outcome("SELECTED", gate="BLOCKED")
        self.write_1b("gate")
        r = self.run_1b()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("verdict BLOCKED, expected PASS or FAIL", r.stdout)

    def test_a_missing_gate_md_fails(self):
        self.outcome("SELECTED")
        self.write_1b("gate")
        self.assertEqual(self.run_1b().returncode, 1)

    def test_after_a_stop_the_blocks_link_the_stop_report(self):
        self.outcome("STOP", stop=True)
        self.write_1b("stop")
        r = self.run_1b()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("evaluations/step1b/pilot-stop.md", r.stdout)

    def test_after_a_stop_a_missing_stop_report_fails(self):
        self.outcome("STOP", stop=False)
        self.write_1b("stop")
        r = self.run_1b()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("pilot-stop.md: missing", r.stdout)

    def test_after_a_stop_a_blocked_gate_md_does_not_satisfy_the_pointers(self):
        """F29: the gate's BLOCKED report is no outcome; after a STOP only the STOP report is."""
        self.outcome("STOP", gate="BLOCKED", stop=True)
        self.write_1b("gate")
        r = self.run_1b()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("no link to evaluations/step1b/pilot-stop.md", r.stdout)

    def test_the_bm3d_wording_is_stale_for_1b_only(self):
        self.outcome("SELECTED", gate="FAIL")
        self.write_1b("gate", step1=f"Verdict: {LINK}; {LINK_1B['gate']}; awaiting the BM3D licence decision.")
        r = self.run_1b()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("'BM3D licence decision'", r.stdout)
        self.assertEqual(self.run_cli().returncode, 0, "1a's wordings are unchanged")

    def test_an_unreadable_1b_pilot_result_is_exit_2(self):
        self.write_1b("gate")
        r = self.run_1b()
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("pilot-result.json", r.stderr)


if __name__ == "__main__":
    unittest.main()
