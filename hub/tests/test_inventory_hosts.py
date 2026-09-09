import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import shutil
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
from executions_store import get_project_dir  # noqa: E402
from inventory_http import list_hosts  # noqa: E402

ROOT_YAML = """
all:
  children:
    redis_lb:
      hosts:
        192.168.1.130:
        192.168.1.131:
        192.168.1.132:
    redis_masters:
      hosts:
        192.168.1.133:
        192.168.1.134:
        192.168.1.135:
    redis_replicas:
      hosts:
        192.168.1.136:
        192.168.1.137:
        192.168.1.138:
"""

NESTED_YAML = """
all:
  children:
    pgsql_lb:
      hosts:
        192.168.2.230:
        192.168.2.231:
        192.168.2.232:
    pgsql_masters:
      hosts:
        192.168.2.233:
        192.168.2.234:
        192.168.2.235:
    pgsql_replicas:
      hosts:
        192.168.2.236:
        192.168.2.237:
        192.168.2.238:
"""


class InventoryHostsTests(unittest.TestCase):
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

    def test_default_list_hosts_prefers_root_invent_yaml(self):
        project_id, headers = self._ansible_project("inv-root-invent")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        (inventories / "pgsql").mkdir(parents=True)
        (inventories / "invent.yaml").write_text(ROOT_YAML, encoding="utf-8")
        (inventories / "pgsql" / "invent.yaml").write_text(
            NESTED_YAML, encoding="utf-8"
        )
        names = list_hosts(project_id)
        self.assertEqual(len(names), 9)
        self.assertEqual(
            names,
            [f"192.168.1.{n}" for n in range(130, 139)],
        )
        listed = self.client.get(
            f"/api/inventory/hosts?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json().get("hosts"), names)

    def test_nested_invent_yaml_when_root_missing(self):
        project_id, _headers = self._ansible_project("inv-nested-only")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        (inventories / "pgsql").mkdir(parents=True)
        (inventories / "pgsql" / "invent.yaml").write_text(
            NESTED_YAML, encoding="utf-8"
        )
        names = list_hosts(project_id)
        self.assertEqual(len(names), 9)
        self.assertEqual(names[0], "192.168.2.230")
        self.assertEqual(names[-1], "192.168.2.238")

    def test_explicit_nested_file(self):
        project_id, _headers = self._ansible_project("inv-explicit-nested")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        (inventories / "pgsql").mkdir(parents=True)
        (inventories / "invent.yaml").write_text(ROOT_YAML, encoding="utf-8")
        (inventories / "pgsql" / "invent.yaml").write_text(
            NESTED_YAML, encoding="utf-8"
        )
        names = list_hosts(project_id, ["pgsql/invent.yaml"])
        self.assertEqual(len(names), 9)
        self.assertTrue(all(n.startswith("192.168.2.") for n in names))

    def test_inventory_preview_reads_group_and_host_vars(self):
        project_id, headers = self._ansible_project("inv-preview")
        inventories = get_project_dir(project_id) / "repo" / "inventories"
        (inventories / "group_vars").mkdir(parents=True)
        (inventories / "host_vars").mkdir(parents=True)
        (inventories / "group_vars" / "all.yml").write_text(
            "ntp_server: pool.ntp.org\n", encoding="utf-8"
        )
        (inventories / "host_vars" / "web1.yml").write_text(
            "http_port: 8080\n", encoding="utf-8"
        )
        res = self.client.get(
            f"/api/inventory/preview?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertTrue(body.get("success"))
        self.assertIn("ntp_server: pool.ntp.org", body["group_vars"]["all"])
        self.assertIn("http_port: 8080", body["host_vars"]["web1"])

    def test_atlas_inventory_hosts_empty(self):
        saved = {
            key: os.environ.get(key)
            for key in ("ATLAS_CLUSTER_ROOT", "ATLAS_CLUSTERS_ROOT", "ATLAS_WORKSPACE_ROOT")
        }
        for key in saved:
            os.environ.pop(key, None)
        try:
            headers = self._login_headers()
            created = self.client.post(
                "/api/projects",
                json={"name": "atlas-inv-empty", "kind": "atlas", "cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            project_id = created.json()["project"]["id"]
            listed = self.client.get(
                f"/api/inventory/hosts?project_id={project_id}",
                headers=headers,
            )
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual(listed.json().get("hosts"), [])
            self.assertTrue(
                (get_project_dir(project_id) / "repo" / "inventories").is_dir()
            )
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_atlas_inventory_hosts_lazy_mkdir(self):
        saved = {
            key: os.environ.get(key)
            for key in ("ATLAS_CLUSTER_ROOT", "ATLAS_CLUSTERS_ROOT", "ATLAS_WORKSPACE_ROOT")
        }
        for key in saved:
            os.environ.pop(key, None)
        try:
            headers = self._login_headers()
            created = self.client.post(
                "/api/projects",
                json={"name": "atlas-inv-lazy", "kind": "atlas", "cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            project_id = created.json()["project"]["id"]
            repo = get_project_dir(project_id) / "repo"
            shutil.rmtree(repo)
            self.assertFalse(repo.exists())
            listed = self.client.get(
                f"/api/inventory/hosts?project_id={project_id}",
                headers=headers,
            )
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual(listed.json().get("hosts"), [])
            self.assertTrue((repo / "inventories").is_dir())
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
