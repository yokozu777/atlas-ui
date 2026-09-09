import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import sys
import tempfile
import unittest
from pathlib import Path

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
from executions_store import get_project_dir  # noqa: E402

ROOT_YAML = """
all:
  children:
    redis_lb:
      hosts:
        192.168.1.130:
        192.168.1.131:
"""


class HostsGroupsApiTests(unittest.TestCase):
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

    def test_nested_group_vars_listing(self):
        project_id, headers = self._ansible_project("hg-nested-vars")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        (inventories / "group_vars").mkdir(parents=True)
        (inventories / "pgsql" / "group_vars").mkdir(parents=True)
        (inventories / "group_vars" / "all.yml").write_text("x: 1\n", encoding="utf-8")
        (inventories / "pgsql" / "group_vars" / "pgsql_lb.yml").write_text(
            "y: 2\n", encoding="utf-8"
        )
        listed = self.client.get(
            f"/api/inventory/vars?project_id={project_id}&kind=group",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        paths = [row["path"] for row in listed.json().get("files") or []]
        self.assertIn("inventories/group_vars/all.yml", paths)
        self.assertIn("inventories/pgsql/group_vars/pgsql_lb.yml", paths)
        preview = self.client.get(
            f"/api/inventory/preview?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertIn("x: 1", preview.json()["group_vars"]["all"])
        self.assertIn("y: 2", preview.json()["group_vars"]["pgsql_lb"])

    def test_host_vars_put_and_get(self):
        project_id, headers = self._ansible_project("hg-host-vars")
        path = "inventories/host_vars/web1.yml"
        saved = self.client.put(
            "/api/inventory/vars/file",
            json={"project_id": project_id, "path": path, "content": "http_port: 8080\n"},
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        got = self.client.get(
            f"/api/inventory/vars/file?project_id={project_id}&path={path}",
            headers=headers,
        )
        self.assertEqual(got.status_code, 200, got.text)
        self.assertIn("http_port: 8080", got.json().get("content") or "")

    def test_add_host_vars_file(self):
        project_id, headers = self._ansible_project("hg-add-host-vars")
        added = self.client.post(
            "/api/inventory/add_host",
            json={
                "project_id": project_id,
                "host_name": "edge1",
                "group_name": "all",
                "inventory_file": "inventory.yml",
                "vars_file": "host_vars/edge1.yml",
            },
            headers=headers,
        )
        self.assertEqual(added.status_code, 200, added.text)
        self.assertEqual(added.json().get("vars_file"), "host_vars/edge1.yml")
        vars_path = (
            get_project_dir(project_id) / "repo" / "inventories" / "host_vars" / "edge1.yml"
        )
        self.assertTrue(vars_path.exists())

    def test_inventory_delete(self):
        project_id, headers = self._ansible_project("hg-inv-delete")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        inventories.mkdir(parents=True, exist_ok=True)
        (inventories / "invent.yaml").write_text(ROOT_YAML, encoding="utf-8")
        deleted = self.client.post(
            "/api/inventory/delete",
            json={"project_id": project_id, "file": "inventories/invent.yaml"},
            headers=headers,
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertFalse((inventories / "invent.yaml").exists())

    def test_ansible_config_select(self):
        project_id, headers = self._ansible_project("hg-cfg-select")
        project_dir = get_project_dir(project_id)
        cfg_dir = project_dir / "ansible-config"
        cfg_dir.mkdir(parents=True, exist_ok=True)
        (cfg_dir / "ansible.cfg").write_text("[defaults]\n", encoding="utf-8")
        (project_dir / "repo" / "ansible.cfg").write_text("[defaults]\nforks=7\n", encoding="utf-8")
        listed = self.client.get(
            f"/api/ansible_config/list?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        paths = [row["path"] for row in listed.json().get("files") or []]
        self.assertIn("ansible-config/ansible.cfg", paths)
        self.assertIn("repo/ansible.cfg", paths)
        selected = self.client.post(
            "/api/ansible_config/select",
            json={"project_id": project_id, "file": "repo/ansible.cfg"},
            headers=headers,
        )
        self.assertEqual(selected.status_code, 200, selected.text)
        self.assertEqual(selected.json().get("selected_config"), "repo/ansible.cfg")
        listed = self.client.get(
            f"/api/ansible_config/list?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.json().get("selected_config"), "repo/ansible.cfg")
        got = self.client.get(
            f"/api/ansible_config/get?project_id={project_id}&file=repo/ansible.cfg",
            headers=headers,
        )
        self.assertEqual(got.status_code, 200, got.text)
        self.assertIn("forks=7", got.json().get("content") or "")

    def test_assign_and_delete_group(self):
        project_id, headers = self._ansible_project("hg-group-mut")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        inventories.mkdir(parents=True, exist_ok=True)
        (inventories / "invent.yaml").write_text(ROOT_YAML, encoding="utf-8")
        assigned = self.client.post(
            "/api/inventory/assign_host",
            json={
                "project_id": project_id,
                "host_name": "192.168.1.130",
                "group_name": "web",
                "inventory_file": "inventories/invent.yaml",
            },
            headers=headers,
        )
        self.assertEqual(assigned.status_code, 200, assigned.text)
        groups = self.client.get(
            f"/api/inventory/groups?project_id={project_id}&inventory_files=inventories/invent.yaml",
            headers=headers,
        )
        self.assertEqual(groups.status_code, 200, groups.text)
        self.assertIn("web", groups.json().get("groups") or {})
        deleted = self.client.delete(
            f"/api/inventory/groups/web?project_id={project_id}&inventory_file=inventories/invent.yaml",
            headers=headers,
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        groups = self.client.get(
            f"/api/inventory/groups?project_id={project_id}&inventory_files=inventories/invent.yaml",
            headers=headers,
        )
        self.assertNotIn("web", groups.json().get("groups") or {})
