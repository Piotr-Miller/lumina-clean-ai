"""regression.py: fixture identity, missing blobs, lockfile identity and exit-status propagation.

Each test builds a throwaway repository with a tiny suite and points the harness at it; no
real S-19/S-20 suite, network or photograph is involved.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

GPT26 = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gpt26_regression", GPT26 / "regression.py")
regression = importlib.util.module_from_spec(spec)
spec.loader.exec_module(regression)

PASSING = "import unittest\n\nclass T(unittest.TestCase):\n    def test_ok(self):\n        pass\n"
FAILING = "import unittest\n\nclass T(unittest.TestCase):\n    def test_no(self):\n        self.fail('boom')\n"


class HarnessTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name) / "repo"
        (self.repo / "node_modules").mkdir(parents=True)
        (self.repo / ".gitignore").write_text("node_modules/\n")
        (self.repo / "package-lock.json").write_text('{"lockfileVersion": 3}\n')
        self.git("init", "-q")
        p = mock.patch.object(regression, "ROOT", self.repo)
        p.start()
        self.addCleanup(p.stop)

    def git(self, *args):
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        env.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True, env=env)

    def add(self, rel, text):
        (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / rel).write_text(text)

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "c")

    def archive(self):
        for rel in regression.S20_FIXTURES:
            self.add(f"{regression.ARCHIVE}/{rel}", f"fixture {rel}\n")

    def run_suite(self, suite):
        log = []
        with contextlib.redirect_stderr(io.StringIO()):
            code = regression.run(suite, "HEAD", log=log.append)
        return code, log

    def assertNoWorktreeLeft(self):
        out = subprocess.run(["git", "-C", str(self.repo), "worktree", "list"], capture_output=True, text=True).stdout
        self.assertEqual(len(out.strip().splitlines()), 1, out)
        self.assertTrue((self.repo / "node_modules").is_dir())

    def test_a_passing_suite_exits_zero(self):
        self.add("scripts/s19/tests/test_x.py", PASSING)
        self.commit()
        code, log = self.run_suite("s19")
        self.assertEqual(code, 0)
        self.assertIn("result OK", log)
        self.assertTrue(any(line.startswith("node_modules linked") for line in log))
        self.assertNoWorktreeLeft()

    def test_a_failing_suite_propagates_its_status(self):
        self.add("scripts/s19/tests/test_x.py", FAILING)
        self.commit()
        code, _ = self.run_suite("s19")
        self.assertEqual(code, 1)
        self.assertNoWorktreeLeft()

    def test_s20_fixtures_are_restored_from_the_revisions_archive(self):
        self.archive()
        checks = "".join(f"        self.assertTrue(Path('{regression.LEGACY}/{rel}').read_text().startswith('fixture'))\n"
                         for rel in regression.S20_FIXTURES)
        self.add("scripts/s20/tests/test_x.py",
                 "import unittest\nfrom pathlib import Path\n\nclass T(unittest.TestCase):\n    def test_f(self):\n" + checks)
        self.commit()
        code, log = self.run_suite("s20")
        self.assertEqual(code, 0, log)
        self.assertEqual(sum(line.startswith("fixture ") for line in log), 4)
        self.assertFalse((self.repo / regression.LEGACY).exists())  # the live checkout is untouched
        self.assertNoWorktreeLeft()

    def test_a_missing_fixture_blob_is_not_run(self):
        self.add("scripts/s20/tests/test_x.py", PASSING)
        self.commit()
        with self.assertRaises(regression.HarnessError) as cm:
            self.run_suite("s20")
        self.assertIn("is missing at", str(cm.exception))
        self.assertNoWorktreeLeft()

    def test_a_fixture_copy_that_differs_is_not_run(self):
        self.archive()
        self.add("scripts/s20/tests/test_x.py", PASSING)
        self.commit()
        with mock.patch.object(regression, "write_fixture", lambda target, data: target.write_bytes(data + b"x")):
            with self.assertRaises(regression.HarnessError) as cm:
                self.run_suite("s20")
        self.assertIn("not byte-identical", str(cm.exception))
        self.assertNoWorktreeLeft()

    def test_a_different_lockfile_is_not_run(self):
        self.add("scripts/s19/tests/test_x.py", PASSING)
        self.commit()
        (self.repo / "package-lock.json").write_text('{"lockfileVersion": 2}\n')
        with self.assertRaises(regression.HarnessError) as cm:
            self.run_suite("s19")
        self.assertIn("differs from the live checkout", str(cm.exception))
        self.assertNoWorktreeLeft()

    def test_main_reports_a_harness_failure_with_exit_two(self):
        with contextlib.redirect_stderr(io.StringIO()) as err, contextlib.redirect_stdout(io.StringIO()):
            code = regression.main(["--suite", "s19", "--revision", "no-such-revision"])
        self.assertEqual(code, 2)
        self.assertIn("NOT RUN", err.getvalue())


if __name__ == "__main__":
    unittest.main()
