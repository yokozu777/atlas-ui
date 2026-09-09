import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402


class BackupHttpTests(unittest.TestCase):
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
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _project(self, headers, name="backup-proj"):
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"]

    def test_settings_roundtrip(self):
        headers = self._login()
        project_id = self._project(headers)
        got = self.client.get("/api/backup-settings", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        self.assertEqual(got.json()["settings"]["max_depth"], 100)
        saved = self.client.put(
            "/api/backup-settings",
            headers=headers,
            json={
                "max_depth": 3,
                "projects": {project_id: {"enabled": True}},
            },
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        settings = saved.json()["settings"]
        self.assertEqual(settings["max_depth"], 3)
        self.assertTrue(settings["projects"][project_id]["enabled"])
        disk = json.loads((self.data_dir / "backup_settings.json").read_text(encoding="utf-8"))
        self.assertEqual(disk["max_depth"], 3)

    def test_create_list_download_restore(self):
        headers = self._login()
        project_id = self._project(headers, name="archive-proj")
        marker = self.data_dir / "projects" / project_id / "marker.txt"
        marker.write_text("hello-backup", encoding="utf-8")
        created = self.client.post(
            "/api/backups/create",
            headers=headers,
            json={"project_id": project_id, "reason": "manual"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        archive = created.json()["archive"]
        self.assertTrue(archive.endswith(".tar.gz"))
        listed = self.client.get(
            f"/api/backups/archives/list?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        names = [row["name"] for row in listed.json().get("archives") or []]
        self.assertIn(archive, names)
        downloaded = self.client.get(
            f"/api/backups/archives/download?project_id={project_id}&path={archive}",
            headers=headers,
        )
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertIn("gzip", downloaded.headers.get("content-type", ""))
        marker.write_text("changed", encoding="utf-8")
        restored = self.client.post(
            "/api/backups/archives/restore",
            headers=headers,
            json={"project_id": project_id, "path": archive},
        )
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(marker.read_text(encoding="utf-8"), "hello-backup")

    def test_auto_requires_enabled(self):
        headers = self._login()
        project_id = self._project(headers, name="auto-off")
        blocked = self.client.post(
            "/api/backups/create",
            headers=headers,
            json={"project_id": project_id, "reason": "auto"},
        )
        self.assertEqual(blocked.status_code, 400, blocked.text)

    def test_rejects_path_traversal(self):
        headers = self._login()
        project_id = self._project(headers, name="safe-proj")
        bad = self.client.get(
            f"/api/backups/archives/download?project_id={project_id}&path=../secret.tar.gz",
            headers=headers,
        )
        self.assertEqual(bad.status_code, 400)


if __name__ == "__main__":
    unittest.main()
