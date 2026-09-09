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


class AtlasClustersHttpTests(unittest.TestCase):
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

    def test_list_and_inspect_override_without_persisting(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl = tmp / "atlas-clusterctl"
            ctl.mkdir()
            binary = ctl / "cluster"
            binary.write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' \"$*\"\n"
                "echo '{\"ok\":true}'\n",
                encoding="utf-8",
            )
            binary.chmod(0o755)
            clusters = tmp / "inventory" / "clusters"
            for cid in ("dev/k8s", "prod/api"):
                leaf = clusters.joinpath(*cid.split("/"))
                leaf.mkdir(parents=True)
                (leaf / "cluster.yaml").write_text(f"id: {cid}\n", encoding="utf-8")
                (leaf / "hosts.yml").write_text(f"cluster: {cid}\n", encoding="utf-8")

            created = self.client.post(
                "/api/projects",
                json={
                    "name": "atlas-session-clusters",
                    "kind": "atlas",
                    "cluster_id": "df/retr",
                    "clusterctlRoot": str(ctl),
                },
                headers=headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            project = created.json()["project"]
            project_id = project["id"]
            self.assertEqual(project.get("cluster_id"), "df/retr")

            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)

            listed = self.client.get(
                f"/api/projects/{project_id}/atlas/clusters",
                headers=headers,
            )
            self.assertEqual(listed.status_code, 200, listed.text)
            body = listed.json()
            self.assertTrue(body.get("success"))
            self.assertEqual(Path(body["clustersRoot"]), clusters.resolve())
            ids = [row["id"] for row in body.get("clusters") or []]
            self.assertEqual(ids, ["dev/k8s", "prod/api"])

            inspect = self.client.post(
                f"/api/projects/{project_id}/atlas/inspect",
                json={"argv": ["plan", "--json"], "cluster_id": "prod/api"},
                headers=headers,
            )
            self.assertEqual(inspect.status_code, 200, inspect.text)
            inspect_body = inspect.json()
            self.assertTrue(inspect_body.get("success"))
            self.assertEqual(inspect_body.get("cluster_id"), "prod/api")
            self.assertIn("prod/api", inspect_body.get("argv") or [])

            unknown = self.client.post(
                f"/api/projects/{project_id}/atlas/inspect",
                json={"argv": ["plan", "--json"], "cluster_id": "../etc"},
                headers=headers,
            )
            self.assertEqual(unknown.status_code, 400, unknown.text)

            missing = self.client.post(
                f"/api/projects/{project_id}/atlas/inspect",
                json={"argv": ["plan", "--json"], "cluster_id": "qa/none"},
                headers=headers,
            )
            self.assertEqual(missing.status_code, 400, missing.text)
            self.assertIn("unknown cluster_id", missing.json().get("error", ""))

            file_res = self.client.get(
                f"/api/projects/{project_id}/atlas/file",
                params={"rel": "prod/api/hosts.yml", "cluster_id": "prod/api"},
                headers=headers,
            )
            self.assertEqual(file_res.status_code, 200, file_res.text)
            self.assertEqual(file_res.json().get("content"), "cluster: prod/api\n")

            fetched = self.client.get(
                f"/api/projects/{project_id}",
                headers=headers,
            )
            self.assertEqual(fetched.status_code, 200, fetched.text)
            again = fetched.json()["project"]
            self.assertEqual(again.get("cluster_id"), "df/retr")


if __name__ == "__main__":
    unittest.main()
