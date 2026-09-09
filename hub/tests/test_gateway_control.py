import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
from atlas_inspect import InspectError, assert_inspect_argv  # noqa: E402
from executions_http import ExecutionHttpError, stop_execution  # noqa: E402


class GatewayControlPlaneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data.get("success"))
        return data["access_token"], data["refresh_token"]

    def test_refresh_issues_access(self):
        _access, refresh = self._login()
        res = self.client.post("/api/auth/refresh", json={"refresh_token": refresh})
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertTrue(data.get("access_token"))

    def test_register_and_claim_empty_queue(self):
        unauth = self.client.post(
            "/api/worker/register",
            json={"name": "test-worker", "tags": ["default"]},
        )
        self.assertEqual(unauth.status_code, 401, unauth.text)
        access, _refresh = self._login()
        res = self.client.post(
            "/api/worker/register",
            json={"name": "test-worker", "tags": ["default"]},
            headers={"Authorization": f"Bearer {access}"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        token = body["workerToken"]
        claim = self.client.post(
            "/api/worker/claim",
            json={"maxConcurrency": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertIn(claim.status_code, (200, 204), claim.text)
        if claim.status_code == 200:
            self.assertTrue(claim.json().get("success"))
            self.assertTrue(claim.json().get("executionId"))

    def test_change_password_clears_must_change_gate(self):
        access, _refresh = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        created = self.client.post(
            "/api/users",
            json={"username": "mustchg", "password": "oldpass1"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        user_id = created.json()["user"]["id"]
        users = gateway.user_service._load_users()
        users[user_id].must_change_password = True
        gateway.user_service._save_users(users)

        login = self.client.post(
            "/api/auth/login",
            json={"username": "mustchg", "password": "oldpass1"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        self.assertTrue(login.json()["user"]["must_change_password"])
        forced = {"Authorization": f"Bearer {login.json()['access_token']}"}

        blocked = self.client.get("/api/projects", headers=forced)
        self.assertEqual(blocked.status_code, 403, blocked.text)

        me = self.client.get("/api/auth/me", headers=forced)
        self.assertEqual(me.status_code, 200, me.text)
        self.assertTrue(me.json().get("must_change_password"))

        changed = self.client.post(
            "/api/auth/change-password",
            json={"old_password": "oldpass1", "new_password": "newpass1"},
            headers=forced,
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        new_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
        ok = self.client.get("/api/projects", headers=new_headers)
        self.assertEqual(ok.status_code, 200, ok.text)

    def test_list_executions_empty(self):
        access, _refresh = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        created = self.client.post(
            "/api/projects",
            json={"name": "exec-empty", "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        listed = self.client.get(
            f"/api/executions?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json().get("executions"), [])

    def test_stop_missing_execution(self):
        access, _refresh = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        created = self.client.post(
            "/api/projects",
            json={"name": "exec-stop", "kind": "ansible"},
            headers=headers,
        )
        project_id = created.json()["project"]["id"]
        stopped = self.client.post(
            f"/api/projects/{project_id}/executions/missing-id/stop",
            headers=headers,
        )
        self.assertEqual(stopped.status_code, 404, stopped.text)
        self.assertIn("not found", stopped.json().get("error", "").lower())

    def test_inspect_still_rejects_run(self):
        with self.assertRaises(InspectError):
            assert_inspect_argv(["run"])

    def test_admin_workers_list(self):
        access, _refresh = self._login()
        listed = self.client.get(
            "/api/admin/workers",
            headers={"Authorization": f"Bearer {access}"},
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(listed.json().get("success"))
        self.assertIn("workers", listed.json())

    def test_stop_helper_missing(self):
        with self.assertRaises(ExecutionHttpError) as ctx:
            stop_execution("no-project", "no-exec")
        self.assertEqual(ctx.exception.status_code, 404)


class GatewayInventoryPlaybooksTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self, username="admin", password="admin123"):
        res = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def _headers(self, token=None):
        access = token or self._login()
        return {"Authorization": f"Bearer {access}"}

    def _ansible_project(self, name, headers=None):
        headers = headers or self._headers()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def test_inventory_list_empty_ansible(self):
        project_id, headers = self._ansible_project("inv-empty")
        listed = self.client.get(
            f"/api/inventory/list?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json().get("files"), [])

    def test_add_host_writes_yaml(self):
        project_id, headers = self._ansible_project("inv-add-host")
        added = self.client.post(
            "/api/inventory/add_host",
            json={
                "project_id": project_id,
                "host_name": "web1",
                "host_ip": "10.0.0.8",
                "group_name": "all",
                "inventory_file": "inventory.yml",
            },
            headers=headers,
        )
        self.assertEqual(added.status_code, 200, added.text)
        self.assertTrue(added.json().get("success"))
        got = self.client.get(
            f"/api/inventory/get?project_id={project_id}&file=inventory.yml",
            headers=headers,
        )
        self.assertEqual(got.status_code, 200, got.text)
        content = got.json().get("content") or ""
        self.assertIn("web1", content)
        hosts = self.client.get(
            f"/api/inventory/hosts?project_id={project_id}&inventory_files=inventory.yml",
            headers=headers,
        )
        self.assertEqual(hosts.status_code, 200, hosts.text)
        self.assertIn("web1", hosts.json().get("hosts") or [])

    def test_playbooks_list_and_create(self):
        project_id, headers = self._ansible_project("pb-list")
        listed = self.client.get(
            f"/api/projects/{project_id}/playbooks",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json().get("playbooks"), [])
        created = self.client.post(
            f"/api/projects/{project_id}/playbooks",
            json={"name": "ping"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        playbook = created.json().get("playbook") or {}
        self.assertTrue(playbook.get("id"))
        listed = self.client.get(
            f"/api/projects/{project_id}/playbooks",
            headers=headers,
        )
        names = [row.get("name") for row in listed.json().get("playbooks") or []]
        self.assertIn("ping", names)

    def test_playbook_run_queues(self):
        project_id, headers = self._ansible_project("pb-run")
        created = self.client.post(
            f"/api/projects/{project_id}/playbooks",
            json={"name": "site"},
            headers=headers,
        )
        playbook_id = created.json()["playbook"]["id"]
        saved = self.client.put(
            f"/api/projects/{project_id}/playbooks/{playbook_id}",
            json={
                "yaml": "- hosts: all\n  gather_facts: false\n  tasks:\n    - ping:\n"
            },
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        queued = self.client.post(
            f"/api/projects/{project_id}/playbooks/{playbook_id}/run",
            json={
                "ansible_config": "ansible-config/ansible.cfg",
                "inventory_files": ["inventory.yml"],
            },
            headers=headers,
        )
        self.assertEqual(queued.status_code, 200, queued.text)
        execution_id = queued.json().get("executionId")
        self.assertTrue(execution_id)
        listed = self.client.get(
            f"/api/executions?project_id={project_id}",
            headers=headers,
        )
        rows = listed.json().get("executions") or []
        self.assertEqual(rows[0]["id"], execution_id)
        self.assertEqual(rows[0]["status"], "QUEUED")

    def test_playbook_validate_and_tags_disabled(self):
        project_id, headers = self._ansible_project("pb-validate")
        created = self.client.post(
            f"/api/projects/{project_id}/playbooks",
            json={"name": "site"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        playbook_id = created.json()["playbook"]["id"]
        play = {
            "id": "play-1",
            "name": "New Play",
            "hosts": [],
            "become": False,
            "strategy": "linear",
            "roles": [],
        }
        validated = self.client.post(
            f"/api/projects/{project_id}/playbooks/{playbook_id}/validate",
            json={
                "playbook": {"name": "site", "plays": [play]},
                "inventory_groups": {},
                "available_roles": [],
            },
            headers=headers,
        )
        self.assertEqual(validated.status_code, 200, validated.text)
        body = validated.json()
        self.assertTrue(body.get("success"))
        self.assertIn("validation", body)
        self.assertGreaterEqual(
            (body.get("validation") or {}).get("summary", {}).get("total_errors", 0),
            1,
        )
        saved = self.client.put(
            f"/api/projects/{project_id}/playbooks/{playbook_id}",
            json={
                "plays": [play],
                "tags": ["prod", "redis"],
                "disabled": True,
            },
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        playbook = saved.json().get("playbook") or {}
        self.assertEqual(playbook.get("tags"), ["prod", "redis"])
        self.assertTrue(playbook.get("disabled"))
        fetched = self.client.get(
            f"/api/projects/{project_id}/playbooks/{playbook_id}",
            headers=headers,
        )
        self.assertEqual(fetched.status_code, 200, fetched.text)
        stored = fetched.json().get("playbook") or {}
        self.assertEqual(stored.get("tags"), ["prod", "redis"])
        self.assertTrue(stored.get("disabled"))
        self.assertEqual((stored.get("metadata") or {}).get("tags"), ["prod", "redis"])
        self.assertTrue((stored.get("metadata") or {}).get("disabled"))

    def test_atlas_run_forbidden_without_execute(self):
        gateway.user_service.create_user(
            username="limited",
            password="limited1",
            email=None,
            roles=[],
        )
        token = self._login("limited", "limited1")
        headers = self._headers(token)
        created = self.client.post(
            "/api/projects",
            json={"name": "atlas-denied", "kind": "atlas", "cluster_id": "dev/k8s"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        denied = self.client.post(
            f"/api/projects/{project_id}/atlas/run",
            json={"phases": ["k8s"]},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertIn("atlas.execute", denied.json().get("error", ""))

    def test_atlas_workspace_reset_queues(self):
        headers = self._headers()
        created = self.client.post(
            "/api/projects",
            json={
                "name": "atlas-ws-reset",
                "kind": "atlas",
                "cluster_id": "dev/k8s",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        with patch(
            "playbooks_http.resolve_inspect_cluster_id",
            return_value="dev/k8s",
        ):
            queued = self.client.post(
                f"/api/projects/{project_id}/atlas/workspace/reset",
                json={"cluster_id": "dev/k8s"},
                headers=headers,
            )
        self.assertEqual(queued.status_code, 200, queued.text)
        body = queued.json()
        self.assertTrue(body.get("success"))
        execution_id = body.get("executionId")
        self.assertTrue(execution_id)
        fetched = self.client.get(
            f"/api/executions/{execution_id}?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(fetched.status_code, 200, fetched.text)
        execution = fetched.json().get("execution") or {}
        self.assertEqual(execution.get("playbookName"), "workspace reset")
        self.assertEqual(execution.get("kind"), "atlas")
        self.assertEqual(execution.get("status"), "QUEUED")
        params = execution.get("runParams") or {}
        self.assertEqual(params.get("argv"), ["workspace", "reset", "--yes"])
        self.assertEqual(params.get("cluster_id"), "dev/k8s")

    def test_atlas_run_passes_executor(self):
        headers = self._headers()
        created = self.client.post(
            "/api/projects",
            json={
                "name": "atlas-executor",
                "kind": "atlas",
                "cluster_id": "dev/k8s",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        with patch(
            "playbooks_http.resolve_inspect_cluster_id",
            return_value="dev/k8s",
        ):
            queued = self.client.post(
                f"/api/projects/{project_id}/atlas/run",
                json={
                    "phases": ["k8s"],
                    "extra_args": ["--executor", "local"],
                    "cluster_id": "dev/k8s",
                },
                headers=headers,
            )
        self.assertEqual(queued.status_code, 200, queued.text)
        execution_id = queued.json().get("executionId")
        fetched = self.client.get(
            f"/api/executions/{execution_id}?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(fetched.status_code, 200, fetched.text)
        params = (fetched.json().get("execution") or {}).get("runParams") or {}
        argv = params.get("argv") or []
        self.assertIn("--executor", argv)
        self.assertEqual(argv[argv.index("--executor") + 1], "local")

    def test_atlas_workspace_reset_forbidden_without_execute(self):
        gateway.user_service.create_user(
            username="limited-ws",
            password="limited1",
            email=None,
            roles=[],
        )
        token = self._login("limited-ws", "limited1")
        headers = self._headers(token)
        created = self.client.post(
            "/api/projects",
            json={
                "name": "atlas-ws-denied",
                "kind": "atlas",
                "cluster_id": "dev/k8s",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        denied = self.client.post(
            f"/api/projects/{project_id}/atlas/workspace/reset",
            json={"cluster_id": "dev/k8s"},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertIn("atlas.execute", denied.json().get("error", ""))

    def test_atlas_repos_sync_queues(self):
        headers = self._headers()
        created = self.client.post(
            "/api/projects",
            json={
                "name": "atlas-repos-sync",
                "kind": "atlas",
                "cluster_id": "dev/k8s",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        with patch(
            "playbooks_http.resolve_inspect_cluster_id",
            return_value="dev/k8s",
        ):
            queued = self.client.post(
                f"/api/projects/{project_id}/atlas/repos/sync",
                json={"cluster_id": "dev/k8s", "repo": "atlas-k8s-core"},
                headers=headers,
            )
        self.assertEqual(queued.status_code, 200, queued.text)
        body = queued.json()
        self.assertTrue(body.get("success"))
        execution_id = body.get("executionId")
        self.assertTrue(execution_id)
        fetched = self.client.get(
            f"/api/executions/{execution_id}?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(fetched.status_code, 200, fetched.text)
        execution = fetched.json().get("execution") or {}
        self.assertEqual(execution.get("playbookName"), "repos sync --repo atlas-k8s-core")
        self.assertEqual(execution.get("kind"), "atlas")
        self.assertEqual(execution.get("status"), "QUEUED")
        params = execution.get("runParams") or {}
        self.assertEqual(
            params.get("argv"),
            ["repos", "sync", "--repo", "atlas-k8s-core"],
        )
        self.assertEqual(params.get("cluster_id"), "dev/k8s")

    def test_atlas_repos_sync_rejects_bad_repo(self):
        headers = self._headers()
        created = self.client.post(
            "/api/projects",
            json={
                "name": "atlas-repos-bad",
                "kind": "atlas",
                "cluster_id": "dev/k8s",
            },
            headers=headers,
        )
        project_id = created.json()["project"]["id"]
        with patch(
            "playbooks_http.resolve_inspect_cluster_id",
            return_value="dev/k8s",
        ):
            denied = self.client.post(
                f"/api/projects/{project_id}/atlas/repos/sync",
                json={"cluster_id": "dev/k8s", "repo": "../secret"},
                headers=headers,
            )
        self.assertEqual(denied.status_code, 400, denied.text)
        self.assertIn("repo", (denied.json().get("error") or "").lower())

    def test_atlas_repos_sync_forbidden_without_execute(self):
        gateway.user_service.create_user(
            username="limited-repos",
            password="limited1",
            email=None,
            roles=[],
        )
        token = self._login("limited-repos", "limited1")
        headers = self._headers(token)
        created = self.client.post(
            "/api/projects",
            json={
                "name": "atlas-repos-denied",
                "kind": "atlas",
                "cluster_id": "dev/k8s",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        denied = self.client.post(
            f"/api/projects/{project_id}/atlas/repos/sync",
            json={"cluster_id": "dev/k8s"},
            headers=headers,
        )
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertIn("atlas.execute", denied.json().get("error", ""))


class GatewayVaultSecretsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self, username="admin", password="admin123"):
        res = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def _headers(self, token=None):
        access = token or self._login()
        return {"Authorization": f"Bearer {access}"}

    def _ansible_project(self, name, headers=None):
        headers = headers or self._headers()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def test_vault_key_writes_pass_file(self):
        project_id, headers = self._ansible_project("vault-key")
        created = self.client.post(
            f"/api/projects/{project_id}/vault-keys",
            json={"name": "prod", "password": "s3cret"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        key = created.json().get("key") or {}
        self.assertTrue(key.get("id"))
        self.assertNotIn("password", key)
        listed = self.client.get(
            f"/api/projects/{project_id}/vault-keys",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        names = [row.get("name") for row in listed.json().get("keys") or []]
        self.assertIn("prod", names)
        for row in listed.json().get("keys") or []:
            self.assertNotIn("password", row)
        from executions_store import get_project_dir

        key_dir = get_project_dir(project_id) / "secrets" / "vault_keys"
        pass_file = key_dir / f"{key['id']}.pass"
        meta_file = key_dir / f"{key['id']}.json"
        self.assertTrue(meta_file.exists())
        self.assertTrue(pass_file.exists())
        self.assertEqual(pass_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(pass_file.read_text(encoding="utf-8").rstrip("\n"), "s3cret")

    def test_delete_key_in_use_rejected(self):
        project_id, headers = self._ansible_project("vault-bound")
        key_res = self.client.post(
            f"/api/projects/{project_id}/vault-keys",
            json={"name": "k1", "password": "pw"},
            headers=headers,
        )
        key_id = key_res.json()["key"]["id"]
        vault_res = self.client.post(
            f"/api/projects/{project_id}/vaults",
            json={"name": "v1", "keyId": key_id, "vaultId": "prod"},
            headers=headers,
        )
        self.assertEqual(vault_res.status_code, 200, vault_res.text)
        denied = self.client.delete(
            f"/api/projects/{project_id}/vault-keys/{key_id}",
            headers=headers,
        )
        self.assertEqual(denied.status_code, 400, denied.text)
        self.assertIn("used by one or more vaults", denied.json().get("error", ""))

    def test_encrypt_decrypt_roundtrip(self):
        import shutil

        if not shutil.which("ansible-vault"):
            self.skipTest("ansible-vault not in PATH")
        project_id, headers = self._ansible_project("vault-crypt")
        key_id = self.client.post(
            f"/api/projects/{project_id}/vault-keys",
            json={"name": "k", "password": "pw"},
            headers=headers,
        ).json()["key"]["id"]
        vault_id = self.client.post(
            f"/api/projects/{project_id}/vaults",
            json={"name": "v", "keyId": key_id},
            headers=headers,
        ).json()["vault"]["id"]
        plain = "hello: world\n"
        encrypted = self.client.post(
            f"/api/projects/{project_id}/vaults/{vault_id}/encrypt",
            json={"content": plain},
            headers=headers,
        )
        self.assertEqual(encrypted.status_code, 200, encrypted.text)
        blob = encrypted.json().get("content") or ""
        self.assertIn("$ANSIBLE_VAULT", blob)
        decrypted = self.client.post(
            f"/api/projects/{project_id}/vaults/{vault_id}/decrypt",
            json={"content": blob},
            headers=headers,
        )
        self.assertEqual(decrypted.status_code, 200, decrypted.text)
        self.assertEqual((decrypted.json().get("content") or "").strip(), plain.strip())

    def test_secrets_login_password_list_hides_material(self):
        project_id, headers = self._ansible_project("sec-login")
        missing = self.client.get("/api/secrets", headers=headers)
        self.assertEqual(missing.status_code, 400, missing.text)
        created = self.client.post(
            f"/api/secrets?project_id={project_id}",
            json={
                "name": "git-auth",
                "type": "login_password",
                "username": "git",
                "password": "hunter2",
                "project_id": project_id,
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        secret = created.json().get("secret") or {}
        self.assertNotIn("password", secret)
        self.assertTrue((secret.get("material") or {}).get("password", {}).get("present"))
        listed = self.client.get(
            f"/api/secrets?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        rows = listed.json().get("secrets") or []
        names = [row.get("name") for row in rows]
        self.assertIn("git-auth", names)
        for row in rows:
            self.assertNotIn("password", row)
            self.assertNotIn("privateKey", row)
        meta = self.client.get(
            f"/api/secrets/meta?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(meta.status_code, 200, meta.text)
        self.assertIn("git-auth", [row.get("name") for row in meta.json().get("secrets") or []])
        deleted = self.client.delete(
            f"/api/secrets/git-auth?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        listed = self.client.get(
            f"/api/secrets?project_id={project_id}",
            headers=headers,
        )
        self.assertNotIn(
            "git-auth",
            [row.get("name") for row in listed.json().get("secrets") or []],
        )

    def test_ssh_key_rejects_invalid(self):
        project_id, headers = self._ansible_project("sec-ssh")
        bad = self.client.post(
            f"/api/secrets?project_id={project_id}",
            json={
                "name": "badkey",
                "type": "ssh_key",
                "privateKey": "not-a-key",
                "project_id": project_id,
            },
            headers=headers,
        )
        self.assertEqual(bad.status_code, 400, bad.text)
        self.assertIn("Invalid private key", bad.json().get("error", ""))


class GatewayGitSourcesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self, username="admin", password="admin123"):
        res = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def _headers(self, token=None):
        access = token or self._login()
        return {"Authorization": f"Bearer {access}"}

    def _ansible_project(self, name, headers=None):
        headers = headers or self._headers()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def test_get_sources_has_repo(self):
        project_id, headers = self._ansible_project("git-get")
        listed = self.client.get(
            f"/api/projects/{project_id}/sources",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertIn("repo", listed.json().get("sources") or {})

    def test_put_git_writes_project_json(self):
        project_id, headers = self._ansible_project("git-put")
        saved = self.client.put(
            f"/api/projects/{project_id}/sources",
            json={
                "sources": {
                    "repo": {
                        "mode": "git",
                        "git": {
                            "repo": "https://git.example/org/repo.git",
                            "ref": "develop",
                            "authSecretId": "git-auth",
                        },
                    }
                }
            },
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        git_cfg = ((saved.json().get("sources") or {}).get("repo") or {}).get("git") or {}
        self.assertEqual(git_cfg.get("repo"), "https://git.example/org/repo.git")
        self.assertEqual(git_cfg.get("ref"), "develop")
        self.assertEqual(git_cfg.get("authSecretId"), "git-auth")
        listed = self.client.get(
            f"/api/projects/{project_id}/sources",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        git_cfg = ((listed.json().get("sources") or {}).get("repo") or {}).get("git") or {}
        self.assertEqual(git_cfg.get("repo"), "https://git.example/org/repo.git")
        from executions_store import get_project_dir
        import json

        config = json.loads(
            (get_project_dir(project_id) / "project.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            ((config.get("sources") or {}).get("repo") or {}).get("git", {}).get("repo"),
            "https://git.example/org/repo.git",
        )

    def test_test_requires_source_key_and_repo(self):
        project_id, headers = self._ansible_project("git-test")
        missing_key = self.client.post(
            f"/api/projects/{project_id}/sources/test",
            json={"config": {"mode": "git"}},
            headers=headers,
        )
        self.assertEqual(missing_key.status_code, 400, missing_key.text)
        self.assertEqual(missing_key.json().get("errorCode"), "MISSING_SOURCE_KEY")
        missing_repo = self.client.post(
            f"/api/projects/{project_id}/sources/test",
            json={"sourceKey": "repo", "config": {"mode": "git", "git": {}}},
            headers=headers,
        )
        self.assertEqual(missing_repo.status_code, 400, missing_repo.text)
        self.assertEqual(missing_repo.json().get("errorCode"), "MISSING_REPO_URL")

    def test_sync_empty_body_uses_repo(self):
        project_id, headers = self._ansible_project("git-sync")
        saved = self.client.put(
            f"/api/projects/{project_id}/sources",
            json={
                "sources": {
                    "repo": {
                        "mode": "git",
                        "git": {"repo": "https://git.example/org/repo.git", "ref": "main"},
                    }
                }
            },
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        fake_path = Path(os.environ["DATA_DIR"]) / "fake-clone"
        fake_path.mkdir(parents=True, exist_ok=True)
        with (
            patch("sources_http.sync_service") as mock_sync,
            patch("sources_http.git_manager") as mock_git,
        ):
            mock_sync.return_value.execute_sync.return_value = (True, None, None)
            mock_git.return_value.resolve_path.return_value = fake_path
            synced = self.client.post(
                f"/api/projects/{project_id}/sources/sync",
                json={},
                headers=headers,
            )
        self.assertEqual(synced.status_code, 200, synced.text)
        self.assertTrue(synced.json().get("success"))
        mock_sync.return_value.execute_sync.assert_called_once()
        called = mock_sync.return_value.execute_sync.call_args.kwargs
        self.assertEqual(called.get("source_key"), "repo")
        self.assertEqual(called.get("direction"), "pull")

    def test_status_nests_overall(self):
        project_id, headers = self._ansible_project("git-status")
        status = self.client.get(
            f"/api/projects/{project_id}/sources/status",
            headers=headers,
        )
        self.assertEqual(status.status_code, 200, status.text)
        payload = status.json()
        self.assertIn("status", payload)
        self.assertIn(payload.get("status", {}).get("overall"), ("ok", "warning", "error"))


class GatewayRolesUsersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self, username="admin", password="admin123"):
        res = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def _headers(self, token=None):
        access = token or self._login()
        return {"Authorization": f"Bearer {access}"}

    def _ansible_project(self, name, headers=None):
        headers = headers or self._headers()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def test_roles_storage_files_get_put(self):
        from executions_store import get_project_dir

        project_id, headers = self._ansible_project("roles-files")
        role_main = (
            get_project_dir(project_id) / "repo" / "roles" / "web" / "tasks" / "main.yml"
        )
        role_main.parent.mkdir(parents=True, exist_ok=True)
        role_main.write_text("---\n- debug: {msg: hi}\n", encoding="utf-8")

        missing = self.client.get("/api/roles/storage", headers=headers)
        self.assertEqual(missing.status_code, 400, missing.text)

        storage = self.client.get(
            f"/api/roles/storage?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(storage.status_code, 200, storage.text)
        payload = storage.json()
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("storageRoot"), "repo/roles")
        roles = [
            node
            for node in (payload.get("tree") or [])
            if node.get("type") == "role" and node.get("name") == "web"
        ]
        self.assertTrue(roles, payload.get("tree"))

        files = self.client.get(
            f"/api/roles/files/web?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(files.status_code, 200, files.text)
        file_paths = [row.get("path") for row in files.json().get("files") or []]
        self.assertIn("tasks/main.yml", file_paths)

        content = self.client.get(
            f"/api/roles/file/web/web/tasks/main.yml?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(content.status_code, 200, content.text)
        self.assertIn("debug", content.json().get("content") or "")

        saved = self.client.put(
            f"/api/roles/file/web/web/tasks/main.yml?project_id={project_id}",
            json={"content": "changed\n"},
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(role_main.read_text(encoding="utf-8"), "changed\n")

        traversal = self.client.get(
            f"/api/roles/file/web/web/..%2Foutside.yml?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(traversal.status_code, 400, traversal.text)

    def test_role_handbook_ansible_repo(self):
        from executions_store import get_project_dir

        project_id, headers = self._ansible_project("roles-handbook")
        repo = get_project_dir(project_id) / "repo"
        (repo / "README.md").write_text("# ansible repo\n", encoding="utf-8")
        docs = repo / "docs"
        docs.mkdir()
        (docs / "setup.md").write_text("# setup\n", encoding="utf-8")
        listed = self.client.get(
            f"/api/roles/handbook?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        packs = listed.json().get("packs") or []
        self.assertEqual(len(packs), 1)
        self.assertEqual(packs[0].get("id"), "repo")
        self.assertEqual(packs[0].get("name"), "Repository")
        paths = [row.get("path") for row in packs[0].get("files") or []]
        self.assertEqual(paths, ["README.md", "docs/setup.md"])
        got = self.client.get(
            f"/api/roles/handbook/file?project_id={project_id}&pack=repo&doc=docs/setup.md",
            headers=headers,
        )
        self.assertEqual(got.status_code, 200, got.text)
        self.assertIn("setup", got.json().get("markdown") or "")

    def test_users_rbac_create_assign_delete(self):
        headers = self._headers()
        listed = self.client.get("/api/users", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        users = listed.json().get("users") or []
        admin = next((row for row in users if row.get("username") == "admin"), None)
        self.assertIsNotNone(admin)
        self.assertNotIn("password_hash", admin or {})

        roles = self.client.get("/api/roles", headers=headers)
        self.assertEqual(roles.status_code, 200, roles.text)
        role_rows = roles.json().get("roles") or []
        self.assertTrue(role_rows)
        role_id = role_rows[0]["id"]

        created = self.client.post(
            "/api/users",
            json={
                "username": "rolesuser",
                "password": "secret12",
                "roles": [role_id],
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        user_id = created.json()["user"]["id"]
        self.assertNotIn("password_hash", created.json().get("user") or {})

        assigned = self.client.put(
            f"/api/users/{user_id}",
            json={"roles": [role_id]},
            headers=headers,
        )
        self.assertEqual(assigned.status_code, 200, assigned.text)
        self.assertEqual(assigned.json().get("user", {}).get("roles"), [role_id])

        deleted = self.client.delete(f"/api/users/{user_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self_delete = self.client.delete(f"/api/users/{admin['id']}", headers=headers)
        self.assertEqual(self_delete.status_code, 400, self_delete.text)

    def test_rbac_role_crud_does_not_capture_storage(self):
        headers = self._headers()
        perms = self.client.get("/api/permissions", headers=headers)
        self.assertEqual(perms.status_code, 200, perms.text)
        perm_rows = perms.json().get("permissions") or []
        self.assertTrue(perm_rows)
        perm_id = perm_rows[0]["id"]

        created = self.client.post(
            "/api/roles",
            json={
                "name": "qa-reviewer",
                "description": "review",
                "permissions": [perm_id],
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        role = created.json().get("role") or {}
        role_id = role.get("id")
        self.assertTrue(role_id)
        self.assertEqual(role.get("permission_names"), [perm_rows[0]["name"]])

        got = self.client.get(f"/api/roles/{role_id}", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        self.assertEqual(got.json().get("role", {}).get("name"), "qa-reviewer")

        users = self.client.get("/api/users", headers=headers)
        admin = next(
            (row for row in (users.json().get("users") or []) if row.get("username") == "admin"),
            None,
        )
        self.assertIsNotNone(admin)
        assigned = self.client.put(
            f"/api/users/{admin['id']}",
            json={"roles": list(dict.fromkeys((admin.get("roles") or []) + [role_id]))},
            headers=headers,
        )
        self.assertEqual(assigned.status_code, 200, assigned.text)
        self.assertIn(role_id, assigned.json().get("user", {}).get("roles") or [])
        restored = self.client.put(
            f"/api/users/{admin['id']}",
            json={"roles": admin.get("roles") or []},
            headers=headers,
        )
        self.assertEqual(restored.status_code, 200, restored.text)

        updated = self.client.put(
            f"/api/roles/{role_id}",
            json={"description": "updated", "permissions": []},
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json().get("role", {}).get("description"), "updated")
        self.assertEqual(updated.json().get("role", {}).get("permission_names"), [])

        missing_perm = self.client.post(
            "/api/roles",
            json={"name": "broken-role", "permissions": ["does-not-exist"]},
            headers=headers,
        )
        self.assertEqual(missing_perm.status_code, 400, missing_perm.text)

        deleted = self.client.delete(f"/api/roles/{role_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        missing = self.client.get(f"/api/roles/{role_id}", headers=headers)
        self.assertEqual(missing.status_code, 404, missing.text)

        storage = self.client.get("/api/roles/storage", headers=headers)
        self.assertEqual(storage.status_code, 400, storage.text)
        project_id, _headers = self._ansible_project("rbac-storage-alive")
        alive = self.client.get(
            f"/api/roles/storage?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(alive.status_code, 200, alive.text)
        self.assertTrue(alive.json().get("success"))


class GatewayFlaskTailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self, username="admin", password="admin123"):
        res = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def _headers(self, token=None):
        access = token or self._login()
        return {"Authorization": f"Bearer {access}"}

    def _ansible_project(self, name, headers=None):
        headers = headers or self._headers()
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"], headers

    def test_worker_create_rotate(self):
        headers = self._headers()
        missing = self.client.post("/api/admin/workers", json={}, headers=headers)
        self.assertEqual(missing.status_code, 400, missing.text)
        created = self.client.post(
            "/api/admin/workers",
            json={"name": "tail-worker"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        token = created.json().get("workerToken")
        worker_id = created.json().get("workerId")
        self.assertTrue(token)
        self.assertTrue(worker_id)
        rotated = self.client.post(
            f"/api/admin/workers/{worker_id}/rotate-token",
            json={},
            headers=headers,
        )
        self.assertEqual(rotated.status_code, 200, rotated.text)
        self.assertTrue(rotated.json().get("workerToken"))
        self.assertNotEqual(rotated.json().get("workerToken"), token)

    def test_permission_create_list_delete(self):
        headers = self._headers()
        created = self.client.post(
            "/api/permissions",
            json={
                "name": "tail.read",
                "description": "tail",
                "resource": "tail",
                "action": "read",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        perm_id = created.json()["permission"]["id"]
        listed = self.client.get("/api/permissions", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        names = [row.get("name") for row in listed.json().get("permissions") or []]
        self.assertIn("tail.read", names)
        deleted = self.client.delete(f"/api/permissions/{perm_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)

    def test_inventory_export_import(self):
        import zipfile
        from io import BytesIO

        project_id, headers = self._ansible_project("inv-zip")
        saved = self.client.post(
            "/api/inventory/save",
            json={
                "project_id": project_id,
                "file": "inventories/inventory.yml",
                "content": "all:\n  hosts:\n    web1:\n",
            },
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        exported = self.client.get(
            f"/api/inventory/export?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertIn("zip", exported.headers.get("content-type", ""))
        names = zipfile.ZipFile(BytesIO(exported.content)).namelist()
        self.assertTrue(any(name.endswith("inventory.yml") for name in names), names)
        imported = self.client.post(
            f"/api/inventory/import?project_id={project_id}",
            files={"file": ("extra.yml", b"all:\n  hosts:\n    db1:\n", "application/x-yaml")},
            headers=headers,
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        from executions_store import get_project_dir

        extra = get_project_dir(project_id) / "repo" / "inventories" / "extra.yml"
        self.assertTrue(extra.exists())
        self.assertIn("db1", extra.read_text(encoding="utf-8"))

    def test_vault_files_plaintext_and_dotdot(self):
        from executions_store import get_project_dir

        project_id, headers = self._ansible_project("vault-files")
        target = get_project_dir(project_id) / "repo" / "group_vars" / "all.yml"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("foo: bar\n", encoding="utf-8")
        got = self.client.get(
            f"/api/projects/{project_id}/vault-files/get?path=group_vars/all.yml",
            headers=headers,
        )
        self.assertEqual(got.status_code, 200, got.text)
        self.assertIn("foo: bar", got.json().get("content") or "")
        saved = self.client.post(
            f"/api/projects/{project_id}/vault-files/save",
            json={"path": "group_vars/all.yml", "content": "foo: baz\n"},
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(target.read_text(encoding="utf-8"), "foo: baz\n")
        bad = self.client.get(
            f"/api/projects/{project_id}/vault-files/get?path=..%2Fsecrets/x.yml",
            headers=headers,
        )
        self.assertEqual(bad.status_code, 400, bad.text)

    def test_autosync_get_put(self):
        import json
        from executions_store import get_project_dir

        project_id, headers = self._ansible_project("autosync")
        listed = self.client.get(
            f"/api/projects/{project_id}/autosync",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertFalse((listed.json().get("autosync") or {}).get("enabled"))
        updated = self.client.put(
            f"/api/projects/{project_id}/autosync",
            json={
                "enabled": True,
                "direction": "pull",
                "sourceKeys": ["repo"],
                "intervalSeconds": 120,
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertTrue(updated.json()["autosync"]["enabled"])
        config = json.loads(
            (get_project_dir(project_id) / "project.json").read_text(encoding="utf-8")
        )
        self.assertTrue((config.get("autosync") or {}).get("enabled"))

    def test_roles_config_is_404(self):
        headers = self._headers()
        res = self.client.get("/api/roles/config", headers=headers)
        self.assertEqual(res.status_code, 404, res.text)

    def test_worker_status_and_finish_maps_canceling_success_to_canceled(self):
        import json
        import time
        from executions_store import get_execution, get_project_executions_dir

        headers = self._headers()
        project_id, headers = self._ansible_project("cancel-finish", headers=headers)
        created = self.client.post(
            "/api/admin/workers",
            json={"name": "cancel-worker"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        token = created.json().get("workerToken")
        worker_id = created.json().get("workerId")
        self.assertTrue(token)
        self.assertTrue(worker_id)
        execution_id = "exec-cancel-1"
        now = time.time()
        rec = {
            "id": execution_id,
            "projectId": project_id,
            "status": "CANCELING",
            "workerId": worker_id,
            "queuedAt": now,
            "startedAt": now,
            "cancelRequestedAt": now,
        }
        dest = get_project_executions_dir(project_id)
        dest.mkdir(parents=True, exist_ok=True)
        (dest / f"{execution_id}.json").write_text(
            json.dumps(rec), encoding="utf-8"
        )

        worker_headers = {"Authorization": f"Bearer {token}"}
        got = self.client.get(
            f"/api/worker/executions/{execution_id}",
            headers=worker_headers,
        )
        self.assertEqual(got.status_code, 200, got.text)
        body = got.json()
        self.assertEqual(body.get("status"), "CANCELING")
        self.assertTrue(body.get("cancelRequested"))
        self.assertEqual((body.get("execution") or {}).get("status"), "CANCELING")

        user_got = self.client.get(
            f"/api/worker/executions/{execution_id}",
            headers=headers,
        )
        self.assertEqual(user_got.status_code, 401, user_got.text)

        finished = self.client.post(
            f"/api/worker/executions/{execution_id}/finish",
            json={"status": "SUCCESS", "finishedAt": time.time(), "returnCode": 0},
            headers=worker_headers,
        )
        self.assertEqual(finished.status_code, 200, finished.text)
        saved = get_execution(execution_id, project_id=project_id)
        self.assertEqual(saved["status"], "CANCELED")


if __name__ == "__main__":
    unittest.main()
