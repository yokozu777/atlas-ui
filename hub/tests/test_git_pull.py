import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
import secret_encryption  # noqa: E402
from git_pull import (  # noqa: E402
    cleanup_git_pull_keys,
    git_ssh_material_dir,
    materialize_git_pull_env,
)


def _ed25519_private_key() -> str:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "id_ed25519"
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-N", "", "-f", str(path), "-q"],
            check=True,
            capture_output=True,
        )
        return path.read_text(encoding="utf-8")


class GitPullHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)
        cls.private_key = _ed25519_private_key()

    def setUp(self):
        secret_encryption._encryption_instance = None

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _atlas_project(self, name, headers=None):
        headers = headers or self._login()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "atlas", "cluster_id": "dev/k8s"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def _create_git_ssh_secret(self, headers, name):
        created = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": name,
                "type": "git_ssh_key",
                "privateKey": self.private_key,
                "username": "git",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        secret = created.json()["secret"]
        self.assertNotIn("privateKey", secret)
        return secret["id"]

    def test_put_and_get_git_pull_default(self):
        project_id, headers = self._atlas_project("git-pull-default")
        secret_id = self._create_git_ssh_secret(headers, "gitea-default")
        updated = self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"defaultSecretId": secret_id}},
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        project = updated.json()["project"]
        self.assertEqual(project["gitPull"]["defaultSecretId"], secret_id)
        self.assertNotIn("privateKey", json.dumps(project))
        got = self.client.get(f"/api/projects/{project_id}", headers=headers)
        self.assertEqual(got.json()["project"]["gitPull"]["defaultSecretId"], secret_id)

    def test_repo_override_and_clear(self):
        project_id, headers = self._atlas_project("git-pull-repo")
        default_id = self._create_git_ssh_secret(headers, "gitea-all")
        repo_id = self._create_git_ssh_secret(headers, "gitea-addons")
        self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"defaultSecretId": default_id}},
            headers=headers,
        )
        patched = self.client.put(
            f"/api/projects/{project_id}",
            json={
                "gitPull": {
                    "repoSecretIds": {"atlas-k8s-addons": repo_id},
                }
            },
            headers=headers,
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        pull = patched.json()["project"]["gitPull"]
        self.assertEqual(pull["defaultSecretId"], default_id)
        self.assertEqual(pull["repoSecretIds"]["atlas-k8s-addons"], repo_id)

        cleared = self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"repoSecretIds": {"atlas-k8s-addons": None}}},
            headers=headers,
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertEqual(
            cleared.json()["project"]["gitPull"].get("repoSecretIds") or {},
            {},
        )

    def test_rejects_unknown_repo_name(self):
        project_id, headers = self._atlas_project("git-pull-bad-repo")
        secret_id = self._create_git_ssh_secret(headers, "gitea-bad-repo")
        denied = self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"repoSecretIds": {"../secret": secret_id}}},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 400, denied.text)

    def test_rejects_git_token(self):
        project_id, headers = self._atlas_project("git-pull-token")
        created = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": "gitea-token-only",
                "type": "git_token",
                "token": "ghp_not_an_ssh_key_value",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        token_id = created.json()["secret"]["id"]
        denied = self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"defaultSecretId": token_id}},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 400, denied.text)

    def test_rejects_ansible_project(self):
        headers = self._login()
        created = self.client.post(
            "/api/projects",
            json={"name": "git-pull-ansible", "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        secret_id = self._create_git_ssh_secret(headers, "gitea-ansible")
        denied = self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"defaultSecretId": secret_id}},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 400, denied.text)

    def test_missing_secret(self):
        project_id, headers = self._atlas_project("git-pull-missing")
        denied = self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"defaultSecretId": "00000000-0000-4000-8000-000000000000"}},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 400, denied.text)

    def test_materialize_writes_key_without_logging_material(self):
        project_id, headers = self._atlas_project("git-pull-materialize")
        secret_id = self._create_git_ssh_secret(headers, "gitea-material")
        self.client.put(
            f"/api/projects/{project_id}",
            json={
                "gitPull": {
                    "defaultSecretId": secret_id,
                    "repoSecretIds": {"atlas-k8s-core": secret_id},
                }
            },
            headers=headers,
        )
        got = self.client.get(f"/api/projects/{project_id}", headers=headers)
        project = got.json()["project"]
        execution_id = "exec-git-pull-1"
        env = materialize_git_pull_env(
            project,
            project_id=project_id,
            execution_id=execution_id,
            data_dir=gateway.DATA_DIR,
        )
        self.assertIn("GIT_SSH_COMMAND", env)
        self.assertIn("PLAYBOOKS_ATLAS_K8S_CORE_SSH_KEY", env)
        key_path = Path(env["PLAYBOOKS_ATLAS_K8S_CORE_SSH_KEY"])
        self.assertTrue(key_path.is_file())
        self.assertEqual(stat.S_IMODE(key_path.stat().st_mode), 0o600)
        self.assertIn("BEGIN", key_path.read_text(encoding="utf-8"))
        self.assertNotIn(self.private_key.strip(), json.dumps(env))
        cleanup_git_pull_keys(
            project_id, execution_id, data_dir=gateway.DATA_DIR
        )
        self.assertFalse(
            git_ssh_material_dir(
                project_id, execution_id, data_dir=gateway.DATA_DIR
            ).exists()
        )

    def test_claim_injects_env_not_persisted_on_execution(self):
        from executions_store import get_execution

        project_id, headers = self._atlas_project("git-pull-claim")
        secret_id = self._create_git_ssh_secret(headers, "gitea-claim")
        self.client.put(
            f"/api/projects/{project_id}",
            json={"gitPull": {"defaultSecretId": secret_id}},
            headers=headers,
        )
        worker = self.client.post(
            "/api/admin/workers",
            json={"name": "git-pull-worker"},
            headers=headers,
        )
        self.assertEqual(worker.status_code, 200, worker.text)
        worker_token = worker.json()["workerToken"]
        with patch(
            "playbooks_http.resolve_inspect_cluster_id",
            return_value="dev/k8s",
        ):
            queued = self.client.post(
                f"/api/projects/{project_id}/atlas/repos/sync",
                json={"cluster_id": "dev/k8s"},
                headers=headers,
            )
        self.assertEqual(queued.status_code, 200, queued.text)
        execution_id = queued.json()["executionId"]
        claimed = self.client.post(
            "/api/worker/claim",
            json={},
            headers={"Authorization": f"Bearer {worker_token}"},
        )
        self.assertEqual(claimed.status_code, 200, claimed.text)
        params = claimed.json().get("runParams") or {}
        env = params.get("env") or {}
        self.assertIn("GIT_SSH_COMMAND", env)
        stored = get_execution(execution_id, project_id=project_id)
        stored_env = (stored.get("runParams") or {}).get("env") or {}
        self.assertNotIn("GIT_SSH_COMMAND", stored_env)
        blob = json.dumps(stored)
        self.assertNotIn("BEGIN", blob)
        self.assertNotIn("privateKey", blob)


if __name__ == "__main__":
    unittest.main()
