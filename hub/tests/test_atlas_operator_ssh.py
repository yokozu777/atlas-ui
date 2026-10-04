import sys
from unittest.mock import patch
from pathlib import Path as _AuthEnvPath

sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import tempfile
import unittest
from pathlib import Path

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
from playbooks_http import resolve_host_ssh_key_file  # noqa: E402
from ssh_key_material import ssh_fingerprint  # noqa: E402


class AtlasOperatorSshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def setUp(self):
        from clusterctl_ssh import save_clusterctl_ssh_secret_id

        save_clusterctl_ssh_secret_id(Path(os.environ["DATA_DIR"]), None)
        save_clusterctl_ssh_secret_id(gateway.DATA_DIR, None)

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _inventory(self, tmp: Path) -> tuple[Path, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text("#!/bin/sh\necho ok\n", encoding="utf-8")
        binary.chmod(0o755)
        clusters = tmp / "inventory" / "clusters"
        leaf = clusters / "lab" / "infra"
        leaf.mkdir(parents=True)
        (leaf / "cluster.yaml").write_text("id: lab/infra\n", encoding="utf-8")
        (leaf / "pub_keys").mkdir()
        (leaf / "pub_keys" / "localuser.pub").write_text(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItemplate template@host\n",
            encoding="utf-8",
        )
        return ctl, clusters

    def test_clusterctl_ssh_get_includes_name_and_fingerprint(self):
        headers = self._login()
        created = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": "atlas-operator-meta",
                "type": "git_ssh_key",
                "generate": True,
                "useAsClusterctlSsh": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        secret = created.json()["secret"]
        got = self.client.get("/api/global/clusterctl-ssh", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        body = got.json()
        self.assertEqual(body.get("sshSecretId"), secret["id"])
        self.assertEqual(body.get("name"), "atlas-operator-meta")
        self.assertTrue(str(body.get("fingerprint") or "").startswith("SHA256:"))
        self.assertNotIn("privateKey", body)
        self.assertNotIn("BEGIN OPENSSH", json_blob(body))

    def test_write_operator_pubkey_matches_atlas_key(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            created = self.client.post(
                "/api/projects",
                json={
                    "name": "operator-ssh-write",
                    "kind": "atlas",
                    "cluster_id": "lab/infra",
                    "clusterctlRoot": str(ctl),
                },
                headers=headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            project_id = created.json()["project"]["id"]
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            secret = self.client.post(
                "/api/global/secrets",
                headers=headers,
                json={
                    "name": "atlas-vm-key",
                    "type": "git_ssh_key",
                    "generate": True,
                    "useAsClusterctlSsh": True,
                },
            )
            self.assertEqual(secret.status_code, 201, secret.text)
            public = secret.json()["secret"].get("publicKey")
            self.assertTrue(str(public).startswith("ssh-ed25519"), public)
            status = self.client.get(
                f"/api/projects/{project_id}/atlas/operator-ssh?cluster_id=lab/infra",
                headers=headers,
            )
            self.assertEqual(status.status_code, 200, status.text)
            self.assertFalse(status.json().get("match"))
            written = self.client.post(
                f"/api/projects/{project_id}/atlas/operator-ssh",
                json={"cluster_id": "lab/infra"},
                headers=headers,
            )
            self.assertEqual(written.status_code, 200, written.text)
            body = written.json()
            self.assertTrue(body.get("match"))
            self.assertTrue(body.get("pubExists"))
            pub = Path(clusters) / "lab" / "infra" / "pub_keys" / "localuser.pub"
            disk = pub.read_text(encoding="utf-8").strip()
            self.assertEqual(disk, str(public).strip())
            self.assertEqual(body.get("pubFingerprint"), ssh_fingerprint(disk))

    def test_write_operator_pubkey_binds_ssh_secret_id(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            created = self.client.post(
                "/api/projects",
                json={
                    "name": "operator-ssh-bind",
                    "kind": "atlas",
                    "cluster_id": "lab/infra",
                    "clusterctlRoot": str(ctl),
                },
                headers=headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            project_id = created.json()["project"]["id"]
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            first = self.client.post(
                "/api/global/secrets",
                headers=headers,
                json={
                    "name": "atlas-first",
                    "type": "git_ssh_key",
                    "generate": True,
                    "useAsClusterctlSsh": True,
                },
            )
            self.assertEqual(first.status_code, 201, first.text)
            second = self.client.post(
                "/api/global/secrets",
                headers=headers,
                json={
                    "name": "atlas-second",
                    "type": "git_ssh_key",
                    "generate": True,
                },
            )
            self.assertEqual(second.status_code, 201, second.text)
            second_id = second.json()["secret"]["id"]
            second_pub = second.json()["secret"].get("publicKey")
            written = self.client.post(
                f"/api/projects/{project_id}/atlas/operator-ssh",
                json={"cluster_id": "lab/infra", "sshSecretId": second_id},
                headers=headers,
            )
            self.assertEqual(written.status_code, 200, written.text)
            body = written.json()
            self.assertTrue(body.get("match"))
            self.assertEqual(body.get("sshSecretId"), second_id)
            pub = Path(clusters) / "lab" / "infra" / "pub_keys" / "localuser.pub"
            self.assertEqual(pub.read_text(encoding="utf-8").strip(), str(second_pub).strip())
            bound = self.client.get("/api/global/clusterctl-ssh", headers=headers)
            self.assertEqual(bound.status_code, 200, bound.text)
            self.assertEqual(bound.json().get("sshSecretId"), second_id)

    def test_host_probe_uses_atlas_key_without_connection_secret(self):
        headers = self._login()
        created = self.client.post(
            "/api/projects",
            json={"name": "operator-ssh-probe", "kind": "atlas"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        secret = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": "atlas-probe-key",
                "type": "git_ssh_key",
                "generate": True,
                "useAsClusterctlSsh": True,
            },
        )
        self.assertEqual(secret.status_code, 201, secret.text)
        dest = gateway.DATA_DIR / "probe.pem"
        path = resolve_host_ssh_key_file(
            project_id, {}, dest, data_dir=gateway.DATA_DIR
        )
        self.assertIsNotNone(path)
        self.assertTrue(Path(path).is_file())
        self.assertIn("BEGIN OPENSSH PRIVATE KEY", Path(path).read_text(encoding="utf-8"))
        ansible = self.client.post(
            "/api/projects",
            json={"name": "operator-ssh-ansible", "kind": "ansible"},
            headers=headers,
        )
        ansible_id = ansible.json()["project"]["id"]
        self.assertIsNone(
            resolve_host_ssh_key_file(
                ansible_id, {}, dest, data_dir=gateway.DATA_DIR
            )
        )

    def test_bootstrap_lists_ssh_key_and_operator_pub(self):
        from playbooks_http import inspect_atlas_bootstrap

        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            pub = clusters / "lab" / "infra" / "pub_keys" / "localuser.pub"
            pub.unlink()
            project = {
                "kind": "atlas",
                "cluster_id": "lab/infra",
                "clusterctlRoot": str(ctl),
                "clustersRoot": str(clusters),
            }

            def fake_inspect(argv, cluster_id, run_params=None):
                del cluster_id, run_params
                if argv[:2] == ["repos", "status"]:
                    return {
                        "success": True,
                        "return_code": 0,
                        "json": {
                            "workspace_root": str(Path(raw) / "workspace"),
                            "lock": {"path": "playbooks.lock"},
                            "repos": [{"name": "atlas-compute-provision", "state": "ready"}],
                        },
                        "log": "{}",
                    }
                if argv[:2] == ["config", "effective"]:
                    return {
                        "success": True,
                        "return_code": 0,
                        "json": {"effective": {"execution": {"mode": "local"}}},
                        "log": "{}",
                    }
                raise AssertionError(argv)

            (Path(raw) / "workspace").mkdir()
            with patch("playbooks_http.inspect_atlas", side_effect=fake_inspect):
                before = inspect_atlas_bootstrap(project, cluster_id="lab/infra")
            kinds = {item.get("kind") for item in before.get("missing") or []}
            self.assertIn("ssh_key", kinds)
            self.assertIn("operator_pub", kinds)

            headers = self._login()
            created = self.client.post(
                "/api/global/secrets",
                headers=headers,
                json={
                    "name": "atlas-bootstrap-key",
                    "type": "git_ssh_key",
                    "generate": True,
                    "useAsClusterctlSsh": True,
                },
            )
            self.assertEqual(created.status_code, 201, created.text)
            saved = self.client.post(
                "/api/projects",
                json={
                    "name": "bootstrap-ssh-gaps",
                    "kind": "atlas",
                    "cluster_id": "lab/infra",
                    "clusterctlRoot": str(ctl),
                },
                headers=headers,
            )
            self.assertEqual(saved.status_code, 200, saved.text)
            project_id = saved.json()["project"]["id"]
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            written = self.client.post(
                f"/api/projects/{project_id}/atlas/operator-ssh",
                json={"cluster_id": "lab/infra"},
                headers=headers,
            )
            self.assertEqual(written.status_code, 200, written.text)
            self.assertTrue(pub.is_file())
            with patch("playbooks_http.inspect_atlas", side_effect=fake_inspect):
                after = inspect_atlas_bootstrap(project, cluster_id="lab/infra")
            after_kinds = {item.get("kind") for item in after.get("missing") or []}
            self.assertNotIn("operator_pub", after_kinds)
            self.assertNotIn("ssh_key", after_kinds)


def json_blob(payload: dict) -> str:
    import json

    return json.dumps(payload)


if __name__ == "__main__":
    unittest.main()
