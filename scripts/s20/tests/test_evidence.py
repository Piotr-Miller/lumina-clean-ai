"""S-20 step 1a, plan Phase 4 item 1: `evidence.py`, the order of the evidence in Git history.

Every case builds its own temporary Git repository; no image, key or tool is involved. "An
uncommitted rule file blocks a real render, while --calibrate still runs" is exercised end to end
by `test_nlm.RulesTest.test_a_modified_grid_blocks_a_real_render_but_not_estimate_only_or_calibrate`;
the STOP-pilot stale freeze by `test_blind` and `test_gate`.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import evidence  # noqa: E402
from protocol import Refused  # noqa: E402

SEAL, RATINGS, FREEZE = "e/seal.md", "e/ratings.json", "e/freeze.json"
DIGEST, KEY = "a" * 64, "b" * 64


class Repo(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="s20-evidence-"))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.git("init", "-q", "-b", "main")
        self.write("README", "base\n")
        self.commit("README")

    def git(self, *args: str) -> str:
        return subprocess.run(["git", "-C", str(self.root), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                               "-c", "commit.gpgsign=false", *args], capture_output=True, text=True, check=True).stdout

    def write(self, rel: str, text: str) -> None:
        (self.root / rel).parent.mkdir(parents=True, exist_ok=True)
        (self.root / rel).write_text(text)

    def commit(self, *rels: str) -> str:
        self.git("add", "--", *rels)
        self.git("commit", "-q", "-m", f"add {' '.join(rels)}")
        return self.git("rev-parse", "HEAD").strip()

    def seal(self, set_id="s-1", digest=DIGEST, key=KEY, kind="pilot") -> None:
        self.write(SEAL, evidence.seal_text(kind, set_id, digest, key))

    def refuses(self, fn, *args, match: str = "") -> str:
        with self.assertRaises(Refused) as cm:
            fn(*args, self.root)
        self.assertIn(match, str(cm.exception))
        return str(cm.exception)


class WriteOnceTest(Repo):
    def test_an_uncommitted_seal_is_refused(self):
        self.seal()
        self.refuses(evidence.require_write_once, SEAL, match="untracked")

    def test_a_dirty_seal_and_a_dirty_freeze_are_refused(self):
        for rel in (SEAL, FREEZE):
            with self.subTest(rel=rel):
                self.write(rel, "one\n")
                self.commit(rel)
                self.write(rel, "two\n")
                self.refuses(evidence.require_write_once, rel, match="modified (unstaged)")
                self.git("checkout", "--", rel)

    def test_a_committed_once_seal_passes_and_names_its_commit(self):
        self.seal()
        c = self.commit(SEAL)
        self.assertEqual(evidence.require_write_once(SEAL, self.root), c)

    def test_a_near_identical_sibling_seal_does_not_lend_its_history(self):
        """The pilot and gate seals share a template; only an exact rename is the same file."""
        self.write("e/pilot-sealed.md", evidence.seal_text("pilot", "p-1", DIGEST, KEY))
        self.commit("e/pilot-sealed.md")
        self.write("e/gate-sealed.md", evidence.seal_text("gate", "g-1", DIGEST, KEY))
        only = self.commit("e/gate-sealed.md")
        self.assertEqual(evidence.require_write_once("e/gate-sealed.md", self.root), only)
        self.git("mv", "e/gate-sealed.md", "e/moved.md")
        self.git("commit", "-q", "-m", "move")
        self.refuses(evidence.require_write_once, "e/moved.md", match="touched by 2 commits")

    def test_the_reproduced_bypass_seal_ratings_then_a_replaced_seal_is_refused(self):
        """F11: the replaced seal would otherwise borrow its original's place in history."""
        self.seal(digest="1" * 64)
        self.commit(SEAL)
        self.write(RATINGS, "{}\n")
        self.commit(RATINGS)
        self.seal(digest="2" * 64)
        self.commit(SEAL)
        self.refuses(evidence.require_write_once, SEAL, match="touched by 2 commits")


class OrderTest(Repo):
    def test_a_seal_and_its_ratings_in_one_commit_are_refused(self):
        self.seal()
        self.write(RATINGS, "{}\n")
        self.commit(SEAL, RATINGS)
        self.refuses(evidence.require_strictly_before, SEAL, RATINGS, match="not strictly before")

    def test_ratings_before_the_seal_are_refused(self):
        self.write(RATINGS, "{}\n")
        self.commit(RATINGS)
        self.seal()
        self.commit(SEAL)
        self.refuses(evidence.require_strictly_before, SEAL, RATINGS, match="not strictly before")

    def test_a_re_exported_ratings_commit_after_the_seal_is_accepted(self):
        self.seal()
        self.commit(SEAL)
        self.write(RATINGS, '{"v": 1}\n')
        self.commit(RATINGS)
        self.write(RATINGS, '{"v": 2}\n')  # re-exported after a BLOCKED, committed later: legal
        self.commit(RATINGS)
        evidence.require_strictly_before(SEAL, RATINGS, self.root)

    def test_every_commit_of_the_earlier_file_must_precede_every_commit_of_the_later(self):
        """ratings ≺ freeze: a ratings commit after the freeze is refused, as the gate's chain needs."""
        self.seal()
        self.commit(SEAL)
        self.write(RATINGS, '{"v": 1}\n')
        self.commit(RATINGS)
        self.write(FREEZE, "{}\n")
        self.commit(FREEZE)
        evidence.require_strictly_before(RATINGS, FREEZE, self.root)
        self.write(RATINGS, '{"v": 2}\n')
        self.commit(RATINGS)
        self.refuses(evidence.require_strictly_before, RATINGS, FREEZE, match="not strictly before")

    def test_an_uncommitted_side_is_refused_not_read_as_ordered(self):
        self.seal()
        self.commit(SEAL)
        self.refuses(evidence.require_strictly_before, SEAL, RATINGS, match="has no commit")

    def test_a_rebase_style_rewritten_history_still_verifies(self):
        """Rebase-merge rewrites every SHA; the order is computed now, never recorded."""
        self.git("checkout", "-q", "-b", "work")
        self.seal()
        self.commit(SEAL)
        self.write(RATINGS, "{}\n")
        before = self.commit(RATINGS)
        self.git("checkout", "-q", "main")
        self.write("other", "x\n")
        self.commit("other")
        self.git("checkout", "-q", "work")
        self.git("rebase", "-q", "main")
        self.assertNotEqual(self.git("rev-parse", "HEAD").strip(), before, "the history was rewritten")
        self.assertEqual(len(evidence.commits(SEAL, self.root)), 1)
        evidence.require_write_once(SEAL, self.root)
        evidence.require_strictly_before(SEAL, RATINGS, self.root)


class SealTest(Repo):
    def test_the_seal_text_round_trips(self):
        self.seal(set_id="pilot-1")
        self.assertEqual(evidence.read_seal(SEAL, "pilot", self.root),
                         {"kind": "pilot", "set_id": "pilot-1", "set_digest": DIGEST, "key_sha256": KEY})

    def test_a_missing_duplicated_malformed_or_foreign_seal_line_is_refused(self):
        line = f"S20-SEAL kind=pilot set_id=s-1 set_digest={DIGEST} key_sha256={KEY}"
        cases = {
            "missing": ("# seal\n\nno line\n", "0 S20-SEAL lines"),
            "duplicated": (f"{line}\n{line}\n", "2 S20-SEAL lines"),
            "malformed": (line.replace(DIGEST, "z" * 64) + "\n", "malformed"),
            "trailing field": (line + " extra=1\n", "malformed"),
            "other kind": (line.replace("kind=pilot", "kind=gate") + "\n", "seals a gate set"),
        }
        for name, (text, match) in cases.items():
            with self.subTest(case=name):
                self.write(SEAL, text)
                with self.assertRaises(Refused) as cm:
                    evidence.read_seal(SEAL, "pilot", self.root)
                self.assertIn(match, str(cm.exception))

    def test_the_seal_states_the_human_control_is_procedural(self):
        text = evidence.seal_text("gate", "g-1", DIGEST, KEY)
        self.assertIn("procedural commitment", text)
        self.assertIn("not technical proof", text)
        self.assertEqual(sum(ln.startswith("S20-SEAL") for ln in text.splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
