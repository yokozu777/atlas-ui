import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from source_sync_service import SourceSyncService  # noqa: E402


class SourceSyncGitHelperTests(unittest.TestCase):
    def test_commit_without_push_returns_revision(self):
        with tempfile.TemporaryDirectory() as raw:
            work = Path(raw) / "repo"
            work.mkdir()
            svc = SourceSyncService(Path(raw) / "projects", MagicMock())
            svc._git_run(["git", "init"], cwd=work, check=True)
            svc._git_run(
                ["git", "checkout", "-b", "main"], cwd=work, check=False
            )
            (work / "readme.txt").write_text("hello\n", encoding="utf-8")
            ok, code, msg, revision = svc._git_commit_and_push(
                work,
                ref="main",
                source_key="repo",
                project_id="p1",
                auth_secret_id=None,
                repo_url="git@example.com:org/repo.git",
                push=False,
            )
            self.assertTrue(ok, msg)
            self.assertIsNone(code)
            self.assertTrue(revision)
            self.assertEqual(svc._git_head_revision(work), revision)

    def test_repo_and_legacy_paths_call_shared_helper(self):
        src = (
            Path(__file__).resolve().parents[1] / "source_sync_service.py"
        ).read_text(encoding="utf-8")
        self.assertGreaterEqual(src.count("self._git_commit_and_push("), 2)
        self.assertGreaterEqual(src.count("self._git_head_revision("), 2)
        self.assertNotIn("(legacy format)", src)


if __name__ == "__main__":
    unittest.main()
