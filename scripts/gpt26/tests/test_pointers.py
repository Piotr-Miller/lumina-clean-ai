"""Offline tests for scripts/gpt26/pointers.py (plan Phase 5, item 2).

Every test builds a synthetic repository root in a temporary directory: one current pointer per
block, plus historical and unrelated text that carries the old wordings and must stay valid.
"""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pointers  # noqa: E402

V = "context/changes/gpt-image-26-screen/evaluations/verdict.md"

FILES = {
    V: "# GPT-Image-2.6 screen — verdict\n\n**Verdict: FAIL.** Pairs at least a tie: 2 of 6 (4 required).\n",
    "context/foundation/roadmap.md": """# Roadmap

### S-20: something

- Status: done. Why parked: a historical note in another block, proposed once.

## Parked

- **Other item (`other-change`).** Why parked: unrelated, proposed.
- **Screening test of GPT-Image-2.6 (`gpt-image-26-screen`, #359).** Screened 2026-11-21: **FAIL**,
  see [verdict](../changes/gpt-image-26-screen/evaluations/verdict.md).

### Resolved (formerly parked)

- **Old thing.** Done.

## Next
""",
    "context/foundation/github-issues.md": """# Issues

## Final mapping (roadmap item → issue)

| Roadmap ID | Issue | Change ID | Status | Labels |
| ---------- | ----- | --------- | ------ | ------ |
| — (change) | [#348](https://github.com/x/y/issues/348) | `local-jev-gate` | proposed | `status:proposed` |
| — (change) | [#359](https://github.com/x/y/issues/359) | `gpt-image-26-screen` | screened: FAIL | `status:proposed` |

## Status updates (post-creation)

| Date | Roadmap ID | Issue | Action |
| ---- | ---------- | ----- | ------ |
| 2026-11-05 | — (change) | [#359](https://github.com/x/y/issues/359) | opened for `gpt-image-26-screen` — proposed screen. |
| 2026-11-21 | — (change) | [#359](https://github.com/x/y/issues/359) | gate run: **FAIL** — [`verdict.md`](../changes/gpt-image-26-screen/evaluations/verdict.md) |

## Not done
""",
    "idea-notes.md": """# Ideas

- ⚠️ Toggle works. **Still not demonstrated (2026-11-21):** the GPT26 screen was **FAIL**
  (`context/changes/gpt-image-26-screen/evaluations/verdict.md`). Cloud stays paused.
""",
    "temp_steps.md": """# Kroki

## Teraz

1. Zrobione — coś innego, zdecyduj, czy robimy coś innego.
2. #359 zakończone: **FAIL** — [werdykt](context/changes/gpt-image-26-screen/evaluations/verdict.md);
   teraz decyzja produktowa o Cloud.

## Kolejka

- **`gpt-image-26-screen`** (#359): **FAIL**, werdykt w
  `context/changes/gpt-image-26-screen/evaluations/verdict.md`; zostało archiwum.
- **`cloud-error-message-leak`**: Potem /rune-plan, w toku.
""",
    "context/changes/gpt-image-26-screen/change.md": """---
status: implementing
---

## Notes

- 2026-11-05: Draft proposed (historical note).

## Outcome

Screen result **FAIL**: [verdict](evaluations/verdict.md).

## GPT26 approvals
""",
}


class PointersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for rel, text in FILES.items():
            p = self.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def reset(self) -> None:
        self.tearDown()
        self.setUp()

    def edit(self, rel: str, old: str, new: str) -> None:
        p = self.root / rel
        text = p.read_text(encoding="utf-8")
        self.assertIn(old, text)
        p.write_text(text.replace(old, new, 1), encoding="utf-8")

    def run_main(self) -> tuple[int, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = pointers.main(["--root", str(self.root)])
        return code, out.getvalue() + err.getvalue()

    def assert_stale(self, needle: str) -> None:
        code, text = self.run_main()
        self.assertEqual(code, 1, text)
        self.assertIn(needle, text)

    def assert_missing(self, needle: str) -> None:
        code, text = self.run_main()
        self.assertEqual(code, 2, text)
        self.assertIn(needle, text)

    def test_current_pointers_pass_with_historical_and_unrelated_old_words(self):
        code, text = self.run_main()
        self.assertEqual(code, 0, text)
        self.assertIn("all 7 GPT26 pointer blocks", text)

    def test_pass_verdict_requires_pass_everywhere(self):
        self.edit(V, "**Verdict: FAIL.**", "**Verdict: PASS.**")
        self.assert_stale("states FAIL, but the verdict is PASS")

    def test_blocked_or_missing_verdict_decides_nothing(self):
        self.edit(V, "**Verdict: FAIL.**", "**Verdict: BLOCKED.**")
        self.assert_missing("no single PASS/FAIL verdict line")
        (self.root / V).unlink()
        self.assert_missing("cannot read")

    def test_missing_or_renamed_blocks(self):
        cases = [
            ("context/changes/gpt-image-26-screen/change.md", "## Outcome", "## Result", "## Outcome"),
            ("temp_steps.md", "## Kolejka", "## Queue", "## Kolejka"),
            ("temp_steps.md", "2. #359", "2. #360", "## Teraz numbered item naming #359"),
            ("idea-notes.md", "**Still not demonstrated", "**Not demonstrated", "Still not demonstrated clause"),
            ("context/foundation/roadmap.md", "## Parked", "## Later", "## Parked"),
            ("context/foundation/github-issues.md", "`gpt-image-26-screen` | screened",
             "`gpt26` | screened", "mapping row"),
            ("context/foundation/github-issues.md", "opened for `gpt-image-26-screen`",
             "created for `gpt-image-26-screen`", "2026-11-05 `opened for` row"),
        ]
        for rel, old, new, needle in cases:
            with self.subTest(rel=rel, old=old):
                self.reset()
                self.edit(rel, old, new)
                self.assert_missing(needle)

    def test_ambiguous_selector(self):
        self.edit("context/foundation/roadmap.md", "- **Other item (`other-change`)",
                  "- **Dup (`gpt-image-26-screen`)")
        self.assert_missing("2 matches, expected one")

    def test_absent_or_wrong_verdict_link(self):
        self.edit("context/changes/gpt-image-26-screen/change.md", "(evaluations/verdict.md)",
                  "(evaluations/verdict.json)")
        self.assert_stale("change.md (## Outcome): no link to")
        self.reset()
        # Resolved against the file's own folder: a root-relative target in a nested file is wrong.
        self.edit("context/foundation/roadmap.md", "(../changes/gpt-image-26-screen/evaluations/verdict.md)",
                  "(context/changes/gpt-image-26-screen/evaluations/verdict.md)")
        self.assert_stale("roadmap.md (Parked entry): no link to")

    def test_contradictory_status(self):
        self.edit("idea-notes.md", "screen was **FAIL**", "screen was **PASS**")
        self.assert_stale("idea-notes.md (Still-not-demonstrated clause): does not state FAIL")

    def test_each_stale_phrase_in_its_own_block(self):
        cases = [
            ("context/foundation/roadmap.md", "Screened 2026-11-21:", "Why parked:", "'Why parked'"),
            ("context/foundation/roadmap.md", "see [verdict]", "Draft: see [verdict]", "'Draft:'"),
            ("context/foundation/roadmap.md", "Screened 2026-11-21:",
             "practically after S-20 step 1 builds its blind viewer;", "'builds its blind viewer'"),
            ("context/foundation/github-issues.md", "| screened: FAIL |", "| proposed **FAIL** |", "'proposed'"),
            ("temp_steps.md", "teraz decyzja", "zdecyduj, czy robimy; decyzja", "'zdecyduj, czy robimy'"),
            ("temp_steps.md", "teraz decyzja", "po #359 decyzja", "'po #359'"),
            ("temp_steps.md", "zostało archiwum", "w toku", "'w toku'"),
            ("temp_steps.md", "zostało archiwum", "Potem /rune-plan", "'Potem /rune-plan'"),
            ("context/changes/gpt-image-26-screen/change.md", "Screen result", "Draft screen result", "'Draft'"),
        ]
        for rel, old, new, needle in cases:
            with self.subTest(rel=rel, new=new):
                self.reset()
                self.edit(rel, old, new)
                self.assert_stale(needle)

    def test_status_log_needs_an_outcome_row(self):
        self.edit("context/foundation/github-issues.md",
                  "| 2026-11-21 | — (change) | [#359](https://github.com/x/y/issues/359) | gate run: **FAIL** — "
                  "[`verdict.md`](../changes/gpt-image-26-screen/evaluations/verdict.md) |\n", "")
        self.assert_stale("no row carries the outcome")

    def test_idea_clause_keeps_unproven_and_paused(self):
        self.edit("idea-notes.md", " Cloud stays paused.", " Cloud may resume.")
        self.assert_stale("lost 'Cloud stays paused'")

    def test_unrelated_entries_keep_their_old_words(self):
        # The other change's bullet in ## Kolejka and other blocks stay out of scope.
        self.edit("temp_steps.md", "Potem /rune-plan, w toku.", "Potem /rune-plan, w toku, proposed, Draft.")
        code, text = self.run_main()
        self.assertEqual(code, 0, text)


if __name__ == "__main__":
    unittest.main()
