import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
from execution_settings_http import load_execution_settings, update_execution_settings  # noqa: E402


class ExecutionSettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)
        cls.data_dir = Path(gateway.DATA_DIR)

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def test_get_requires_auth(self):
        res = self.client.get("/api/execution_settings")
        self.assertEqual(res.status_code, 401)

    def test_get_defaults_and_post_merge(self):
        token = self._login()
        headers = {"Authorization": f"Bearer {token}"}
        got = self.client.get("/api/execution_settings", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        body = got.json()
        self.assertTrue(body.get("success"))
        self.assertEqual(body["settings"]["log_level"], "INFO")
        self.assertIn("count", body["stats"])
        saved = self.client.post(
            "/api/execution_settings",
            headers=headers,
            json={"log_level": "DEBUG", "retention_count": 12, "save_history": True},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        settings = saved.json()["settings"]
        self.assertEqual(settings["log_level"], "DEBUG")
        self.assertEqual(settings["retention_count"], 12)
        disk = json.loads((self.data_dir / "execution_settings.json").read_text(encoding="utf-8"))
        self.assertEqual(disk["log_level"], "DEBUG")
        merged = update_execution_settings(self.data_dir, {"max_log_size_mb": 3})
        self.assertEqual(merged["settings"]["log_level"], "DEBUG")
        self.assertEqual(merged["settings"]["max_log_size_mb"], 3)
        self.assertEqual(load_execution_settings(self.data_dir)["max_log_size_mb"], 3)

    def test_clear_executions(self):
        token = self._login()
        headers = {"Authorization": f"Bearer {token}"}
        project_id = "clear-test-project"
        exec_dir = self.data_dir / "projects" / project_id / "history" / "executions"
        exec_dir.mkdir(parents=True, exist_ok=True)
        (exec_dir / "exec-1.json").write_text(
            json.dumps({"id": "exec-1", "status": "SUCCESS"}),
            encoding="utf-8",
        )
        cleared = self.client.post(
            "/api/executions/clear",
            headers=headers,
            json={},
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)
        body = cleared.json()
        self.assertTrue(body.get("success"))
        self.assertGreaterEqual(body.get("deletedCount") or 0, 1)
        self.assertFalse((exec_dir / "exec-1.json").exists())


if __name__ == "__main__":
    unittest.main()
