"""Offline tests for scripts/gpt26/pointers.py (plan `gpt-image-26-wider` Phase 1 §1, Phase 5 §2).

Every test builds a synthetic repository root in a temporary directory: a study config, one
current pointer per block, plus historical and unrelated text that carries the stale wordings
and must stay valid. The default tree has no GitHub issue for the change; the issue branch is
tested by adding a mapping row.
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pointers  # noqa: E402

CID = "gpt-image-26-wider"
CONFIG = "scripts/gpt26/configs/wider.json"
V = f"context/changes/{CID}/evaluations/verdict.md"
STUDY = {"change_dir": f"context/changes/{CID}", "series": "scripts/gpt26/series/wider.json",
         "viewer": f"context/changes/{CID}/references/compare-gpt26.html",
         "private_root": "test-photos/private/gpt26-wider", "series_id": "gpt26-wider"}

FILES = {
    CONFIG: json.dumps({"study": STUDY, "gate": {"expected_slots": [{"photo": "S17-01", "slot": 1}]}}),
    V: "# GPT26 study `gpt26-wider` — verdict\n\n**Verdict: FAIL.** Pairs at least a tie: 7 of 16 (8 required).\n",
    "context/foundation/roadmap.md": """# Roadmap

### S-20: something

- Status: done. A screening pass only opens a wider comparison (historical, another block).

## Parked

- **Other item (`other-change`).** Not yet a change.
- **Wider comparison of GPT-Image-2.6 (`gpt-image-26-wider`).** Compared 2026-12-01: **FAIL**,
  see [verdict](../changes/gpt-image-26-wider/evaluations/verdict.md). The screen of 2026-11-21 was
  a PASS; this result supersedes it.

### Resolved (formerly parked)

- **Old thing.** Done.

## Next
""",
    "context/foundation/github-issues.md": """# Issues

## Final mapping (roadmap item → issue)

| Roadmap ID | Issue | Change ID | Status | Labels |
| ---------- | ----- | --------- | ------ | ------ |
| — (change) | [#359](https://github.com/x/y/issues/359) | `gpt-image-26-screen` | screened: PASS | `status:done` |

## Status updates (post-creation)

| Date | Roadmap ID | Issue | Action |
| ---- | ---------- | ----- | ------ |
| 2026-11-05 | — (change) | [#359](https://github.com/x/y/issues/359) | opened for `gpt-image-26-screen`. |

## Not done
""",
    "idea-notes.md": """# Ideas

- ⚠️ Toggle works. **Still not demonstrated (2026-12-01):** the wider GPT26 comparison was
  **FAIL** (`context/changes/gpt-image-26-wider/evaluations/verdict.md`). Cloud stays paused.
""",
    "temp_steps.md": """# Kroki

## Teraz

1. Zrobione — coś innego; screen kiedyś tylko otwierał porównanie.
2. Porównanie `gpt-image-26-wider` zakończone: **FAIL** —
   [werdykt](context/changes/gpt-image-26-wider/evaluations/verdict.md); teraz decyzja o Cloud.

## Kolejka

- **`gpt-image-26-wider`**: **FAIL**, werdykt w
  `context/changes/gpt-image-26-wider/evaluations/verdict.md`; zostało archiwum.
- **`cloud-error-message-leak`**: Not yet a change.
""",
    f"context/changes/{CID}/change.md": """---
status: implementing
---

## Notes

- 2026-11-21: the screen only opens a wider comparison (historical note).

## Outcome

Wider comparison **FAIL**: [verdict](evaluations/verdict.md).

## GPT26 approvals
""",
}

ISSUE_ROW = ("| — (change) | [#400](https://github.com/x/y/issues/400) | `gpt-image-26-wider` | "
             "[compared: FAIL](../changes/gpt-image-26-wider/evaluations/verdict.md) | `status:done` |\n")
ISSUE_LOG = ("| 2026-12-01 | — (change) | [#400](https://github.com/x/y/issues/400) | wider comparison: **FAIL** — "
             "[`verdict.md`](../changes/gpt-image-26-wider/evaluations/verdict.md) |\n")


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

    def add_issue(self) -> None:
        issues = "context/foundation/github-issues.md"
        self.edit(issues, "\n\n## Status updates", ISSUE_ROW.rstrip("\n").join(["\n", "\n\n## Status updates"]))
        self.edit(issues, "\n\n## Not done", ISSUE_LOG.rstrip("\n").join(["\n", "\n\n## Not done"]))

    def run_main(self, *args: str) -> tuple[int, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = pointers.main(list(args or ("--config", CONFIG, "--root", str(self.root))))
        return code, out.getvalue() + err.getvalue()

    def assert_stale(self, needle: str) -> None:
        code, text = self.run_main()
        self.assertEqual(code, 1, text)
        self.assertIn(needle, text)

    def assert_missing(self, needle: str) -> None:
        code, text = self.run_main()
        self.assertEqual(code, 2, text)
        self.assertIn(needle, text)

    def test_current_pointers_pass_without_an_issue(self):
        code, text = self.run_main()
        self.assertEqual(code, 0, text)
        self.assertIn("all 5 GPT26 pointer blocks", text)

    def test_an_issue_adds_its_status_cell_and_outcome_row(self):
        self.add_issue()
        code, text = self.run_main()
        self.assertEqual(code, 0, text)
        self.assertIn("all 7 GPT26 pointer blocks", text)

    def test_an_issue_needs_its_dated_outcome_row_and_status(self):
        self.add_issue()
        self.edit("context/foundation/github-issues.md", ISSUE_LOG, "")
        self.assert_stale("status-log outcome row for #400): no row carries the outcome")
        self.reset()
        self.add_issue()
        self.edit("context/foundation/github-issues.md", "[compared: FAIL]", "[compared: PASS]")
        self.assert_stale("mapping row #400 (Status cell)): does not state FAIL")
        self.reset()
        self.add_issue()  # the outcome row must be for this change's issue, not the predecessor's
        self.edit("context/foundation/github-issues.md", ISSUE_LOG, ISSUE_LOG.replace("400", "359"))
        self.assert_stale("no row carries the outcome")

    def test_duplicate_issue_mapping_heading_is_ambiguous(self):
        self.add_issue()
        self.edit("context/foundation/github-issues.md", "## Status updates", "## Final mapping\n\n## Status updates")
        self.assert_missing("## Final mapping: 2 matching headings, expected one")

    def test_a_mapping_row_without_an_issue_number_is_not_checked(self):
        row = "| — (change) | — | `gpt-image-26-wider` | proposed | — |\n"
        self.edit("context/foundation/github-issues.md", "\n\n## Status updates",
                  row.rstrip("\n").join(["\n", "\n\n## Status updates"]))
        code, text = self.run_main()
        self.assertEqual(code, 0, text)

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
            (f"context/changes/{CID}/change.md", "## Outcome", "## Result", "## Outcome"),
            ("temp_steps.md", "## Kolejka", "## Queue", "## Kolejka"),
            ("temp_steps.md", FILES["temp_steps.md"].split("2. ")[1].split("\n\n")[0], "Inne.",
             "## Teraz numbered item naming"),
            ("temp_steps.md", "- **`gpt-image-26-wider`**", "- **wider**", "## Kolejka bullet naming"),
            ("idea-notes.md", "**Still not demonstrated", "**Not demonstrated", "Still not demonstrated clause"),
            ("context/foundation/roadmap.md", "## Parked", "## Later", "## Parked"),
            ("context/foundation/roadmap.md", "(`gpt-image-26-wider`)", "(wider)", "## Parked bullet naming"),
        ]
        for rel, old, new, needle in cases:
            with self.subTest(rel=rel, old=old):
                self.reset()
                self.edit(rel, old, new)
                self.assert_missing(needle)

    def test_duplicate_blocks_are_ambiguous(self):
        cases = [
            ("context/foundation/roadmap.md", "- **Other item (`other-change`)", "- **Dup (`gpt-image-26-wider`)"),
            ("temp_steps.md", "1. Zrobione — coś innego", "1. Zrobione — `gpt-image-26-wider` wcześniej"),
            ("temp_steps.md", "- **`cloud-error-message-leak`**", "- **`gpt-image-26-wider`** again"),
        ]
        for rel, old, new in cases:
            with self.subTest(rel=rel, new=new):
                self.reset()
                self.edit(rel, old, new)
                self.assert_missing("2 matches, expected one")

    def test_absent_or_wrong_verdict_link(self):
        self.edit(f"context/changes/{CID}/change.md", "(evaluations/verdict.md)", "(evaluations/verdict.json)")
        self.assert_stale("change.md (## Outcome): no link to")
        self.reset()
        # Resolved against the file's own folder: a root-relative target in a nested file is wrong.
        self.edit("context/foundation/roadmap.md", "(../changes/gpt-image-26-wider/evaluations/verdict.md)",
                  "(context/changes/gpt-image-26-wider/evaluations/verdict.md)")
        self.assert_stale("roadmap.md (Parked entry): no link to")

    def test_contradictory_status(self):
        self.edit("idea-notes.md", "  **FAIL**", "  **PASS**")
        self.assert_stale("idea-notes.md (Still-not-demonstrated clause): does not state FAIL")

    def test_each_stale_claim_in_every_block(self):
        claims = ("only opens a wider comparison", "Only Opens This Wider Comparison", "not yet a change",
                  "otworzyć to porównanie jako nową zmianę")
        blocks = [
            ("context/foundation/roadmap.md", "this result supersedes it.", "Parked entry"),
            ("idea-notes.md", "Cloud stays paused.", "Still-not-demonstrated clause"),
            ("temp_steps.md", "teraz decyzja o Cloud.", "## Teraz item"),
            ("temp_steps.md", "zostało archiwum.", "## Kolejka entry"),
            (f"context/changes/{CID}/change.md", "Wider comparison **FAIL**", "## Outcome"),
        ]
        for rel, anchor, name in blocks:
            for claim in claims:
                with self.subTest(block=name, claim=claim):
                    self.reset()
                    self.edit(rel, anchor, f"{anchor} {claim}")
                    self.assert_stale(f"({name}): stale current claim")

    def test_a_line_break_cannot_hide_a_stale_claim(self):
        self.edit("temp_steps.md", "teraz decyzja o Cloud.",
                  "teraz decyzja o Cloud. Trzeba otworzyć to porównanie\n   jako nową zmianę.")
        self.assert_stale("stale current claim 'otworzyć to porównanie jako nową zmianę'")

    def test_idea_clause_keeps_unproven_and_paused(self):
        self.edit("idea-notes.md", " Cloud stays paused.", " Cloud may resume.")
        self.assert_stale("lost 'Cloud stays paused'")

    def test_unrelated_and_historical_entries_keep_their_old_words(self):
        # Other changes' entries, the predecessor's issue rows and dated history stay out of scope.
        code, text = self.run_main()
        self.assertEqual(code, 0, text)
        for needle in ("Not yet a change", "only opens a wider comparison", "opened for `gpt-image-26-screen`"):
            self.assertIn(needle.lower(), "".join(FILES.values()).lower())

    def test_usage_and_invalid_study(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            pointers.main(["--root", str(self.root)])
        self.assertEqual(cm.exception.code, 2)
        (self.root / CONFIG).write_text(json.dumps({"study": dict(STUDY, change_dir="context/archive/x")}))
        self.assert_missing("the study is not valid")


if __name__ == "__main__":
    unittest.main()
