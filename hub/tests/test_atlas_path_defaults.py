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
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402


class AtlasPathDefaultsHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def test_put_paths_and_read_defaults(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl = Path(raw) / "atlas-clusterctl"
            cfg = ctl / ".config"
            cfg.mkdir(parents=True)
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (cfg / "config.yaml").write_text(
                "clusters:\n  path: /from-yaml/clusters\n"
                "workspace:\n  path: /from-yaml/workspace\n",
                encoding="utf-8",
            )
            created = self.client.post(
                "/api/projects",
                json={
                    "name": "atlas-path-defaults",
                    "kind": "atlas",
                    "cluster_id": "dev/k8s",
                    "clusterctlRoot": str(ctl),
                },
                headers=headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            project_id = created.json()["project"]["id"]

            defaults = self.client.get(
                f"/api/projects/{project_id}/atlas/path-defaults",
                headers=headers,
            )
            self.assertEqual(defaults.status_code, 200, defaults.text)
            body = defaults.json()
            self.assertTrue(body.get("success"))
            self.assertTrue(body.get("configExists"))
            self.assertEqual(body.get("clustersRoot"), "/from-yaml/clusters")
            self.assertEqual(body.get("workspaceRoot"), "/from-yaml/workspace")

            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={
                    "clustersRoot": "/saved/clusters",
                    "workspaceRoot": "/saved/workspace",
                },
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            project = updated.json()["project"]
            self.assertEqual(project.get("clustersRoot"), "/saved/clusters")
            self.assertEqual(project.get("workspaceRoot"), "/saved/workspace")

            fetched = self.client.get(
                f"/api/projects/{project_id}",
                headers=headers,
            )
            self.assertEqual(fetched.status_code, 200, fetched.text)
            again = fetched.json()["project"]
            self.assertEqual(again.get("clustersRoot"), "/saved/clusters")
            self.assertEqual(again.get("workspaceRoot"), "/saved/workspace")

            cleared = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": "", "workspaceRoot": ""},
                headers=headers,
            )
            self.assertEqual(cleared.status_code, 200, cleared.text)
            cleared_project = cleared.json()["project"]
            self.assertFalse(cleared_project.get("clustersRoot"))
            self.assertFalse(cleared_project.get("workspaceRoot"))


if __name__ == "__main__":
    unittest.main()
