import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
from executions_store import get_project_dir  # noqa: E402
from host_status import get_host_statuses, set_host_check_status  # noqa: E402


class HostStatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login_headers(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _ansible_project(self, name):
        headers = self._login_headers()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def test_get_empty_without_file(self):
        project_id, headers = self._ansible_project("host-status-empty")
        self.assertEqual(get_host_statuses(project_id), {})
        res = self.client.get(
            f"/api/inventory/host-status?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertTrue(body.get("success"))
        self.assertEqual(body.get("hosts"), {})

    def test_set_then_get_online(self):
        project_id, headers = self._ansible_project("host-status-set")
        set_host_check_status(project_id, "192.168.1.130", "online")
        got = get_host_statuses(project_id)
        self.assertEqual(got["192.168.1.130"]["status"], "online")
        self.assertTrue(got["192.168.1.130"].get("last_checked_at"))
        res = self.client.get(
            f"/api/inventory/host-status?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(
            res.json()["hosts"]["192.168.1.130"]["status"], "online"
        )

    def test_expired_status_is_unknown(self):
        project_id, _headers = self._ansible_project("host-status-expired")
        past = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        past = past.replace("+00:00", "Z")
        status_file = get_project_dir(project_id) / "host_status.json"
        status_file.write_text(
            json.dumps(
                {
                    "hosts": {
                        "web1": {
                            "status": "online",
                            "last_checked_at": past,
                            "status_expires_at": past,
                        }
                    }
                }
            )
            + "\n",
            encoding="utf-8",
        )
        got = get_host_statuses(project_id)
        self.assertEqual(got["web1"]["status"], "unknown")
