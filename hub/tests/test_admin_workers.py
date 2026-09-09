import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
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


class AdminWorkersCrudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def test_get_patch_delete_worker(self):
        headers = self._login()
        created = self.client.post(
            "/api/admin/workers",
            headers=headers,
            json={"name": "settings-worker", "tags": ["local"]},
        )
        self.assertEqual(created.status_code, 200, created.text)
        worker_id = created.json()["workerId"]
        self.assertTrue(created.json().get("workerToken"))
        got = self.client.get(f"/api/admin/workers/{worker_id}", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        worker = got.json()["worker"]
        self.assertEqual(worker["name"], "settings-worker")
        self.assertNotIn("token", worker)
        self.assertNotIn("tokenHash", worker)
        patched = self.client.patch(
            f"/api/admin/workers/{worker_id}",
            headers=headers,
            json={"name": "renamed-worker", "description": "hub", "tags": ["default", "local"]},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["worker"]["name"], "renamed-worker")
        self.assertEqual(patched.json()["worker"]["tags"], ["default", "local"])
        deleted = self.client.delete(f"/api/admin/workers/{worker_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        missing = self.client.get(f"/api/admin/workers/{worker_id}", headers=headers)
        self.assertEqual(missing.status_code, 404)

    def test_list_includes_inferred_runtime(self):
        headers = self._login()
        created = self.client.post(
            "/api/admin/workers",
            headers=headers,
            json={"name": "runtime-worker"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        worker_id = created.json()["workerId"]
        listed = self.client.get("/api/admin/workers", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        row = next(w for w in listed.json()["workers"] if w["id"] == worker_id)
        self.assertIsNone(row.get("runtime"))

        from worker_registry import load_worker, save_worker

        worker = load_worker(worker_id)
        worker["systemInfo"] = {
            "hostname": "docker-desktop",
            "os": {"kernel": "linuxkit"},
        }
        self.assertTrue(save_worker(worker))
        listed = self.client.get("/api/admin/workers", headers=headers)
        row = next(w for w in listed.json()["workers"] if w["id"] == worker_id)
        self.assertEqual(row["runtime"], "docker")

        worker["systemInfo"] = {
            "hostname": "wm",
            "os": {"kernel": "#31-generic", "version": "7.0.0"},
            "runtime": "local",
        }
        self.assertTrue(save_worker(worker))
        got = self.client.get(f"/api/admin/workers/{worker_id}", headers=headers)
        self.assertEqual(got.json()["worker"]["runtime"], "local")


if __name__ == "__main__":
    unittest.main()
