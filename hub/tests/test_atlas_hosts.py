import sys
from pathlib import Path as _AuthEnvPath

sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import tempfile
import uuid
import unittest
from pathlib import Path

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402

HOSTS_K8S = """\
all:
  children:
    k8s_lbs:
      hosts:
        192.168.1.220:
          hostname: lb1.example.com
          provision:
            vmid: '220'
            sockets: 1
            cores: 2
            memory: 4096
            numa: false
            clone: ubuntu-base
            disks:
            - size: '70'
              slot: 0
              storage: local-zfs
              wwn: '0x5000c500c35cd220'
    k8s_masters:
      hosts:
        192.168.1.225:
          hostname: kubemaster01.example.com
          provision:
            vmid: '225'
            sockets: 1
            cores: 2
            memory: 8096
            numa: false
            clone: debian-base
            disks:
            - size: '70'
              slot: 0
              storage: local-zfs
  vars:
    ansible_ssh_user: localuser
"""

HOSTS_NESTED = """\
all:
  children:
    postgresql:
      children:
        pgsql_etcd_cluster:
          hosts:
            192.168.1.126:
              hostname: pgsql-etcd01.example.com
              provision:
                vmid: '5700'
                sockets: 1
                cores: 2
                memory: 4096
                numa: false
                clone: ubuntu-base
                disks:
                - size: '50'
                  slot: 0
                  storage: local-zfs
  vars:
    ansible_python_interpreter: /usr/bin/python3
"""


class AtlasHostsHttpTests(unittest.TestCase):
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

    def _fixture(self, tmp: Path, hosts_text: str, cid: str = "lab/k8s") -> tuple[str, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text("#!/bin/sh\necho '{}'\n", encoding="utf-8")
        binary.chmod(0o755)
        env, name = cid.split("/", 1)
        leaf = tmp / "inventory" / "clusters" / env / name
        leaf.mkdir(parents=True)
        (leaf / "cluster.yaml").write_text(f"id: {cid}\n", encoding="utf-8")
        (leaf / "hosts").write_text(hosts_text, encoding="utf-8")
        gv = leaf / "group_vars" / "all"
        gv.mkdir(parents=True)
        (gv / "atlas-compute-provision.yml").write_text(
            "provision_pve_templates:\n"
            "  ubuntu-base:\n"
            "    id: 1\n"
            "    image_url: https://example.com/u.img\n"
            "  debian-base:\n"
            "    id: 2\n"
            "    image_url: https://example.com/d.qcow2\n",
            encoding="utf-8",
        )
        created = self.client.post(
            "/api/projects",
            json={
                "name": f"hosts-{name}-{uuid.uuid4().hex[:8]}",
                "kind": "atlas",
                "cluster_id": cid,
                "clusterctlRoot": str(ctl),
            },
            headers=self._login(),
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        updated = self.client.put(
            f"/api/projects/{project_id}",
            json={"clustersRoot": str(tmp / "inventory" / "clusters")},
            headers=self._login(),
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        return project_id, leaf

    def test_list_groups_and_clone_options(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            project_id, _leaf = self._fixture(Path(raw), HOSTS_K8S)
            res = self.client.get(
                f"/api/projects/{project_id}/atlas/hosts",
                params={"cluster_id": "lab/k8s"},
                headers=headers,
            )
            self.assertEqual(res.status_code, 200, res.text)
            body = res.json()
            self.assertTrue(body.get("success"))
            ids = [row["id"] for row in body.get("groups") or []]
            self.assertEqual(ids, ["k8s_lbs", "k8s_masters"])
            lbs = (body.get("groups") or [])[0]
            self.assertEqual(lbs["hosts"][0]["ip"], "192.168.1.220")
            self.assertEqual(lbs["hosts"][0]["hostname"], "lb1.example.com")
            self.assertEqual(lbs["hosts"][0]["cores"], 2)
            self.assertEqual(lbs["hosts"][0]["memory"], 4096)
            self.assertEqual(lbs["hosts"][0]["clone"], "ubuntu-base")
            self.assertEqual(body.get("cloneOptions"), ["ubuntu-base", "debian-base"])

    def test_nested_groups(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            project_id, _leaf = self._fixture(
                Path(raw), HOSTS_NESTED, cid="lab/pgsql"
            )
            res = self.client.get(
                f"/api/projects/{project_id}/atlas/hosts",
                params={"cluster_id": "lab/pgsql"},
                headers=headers,
            )
            self.assertEqual(res.status_code, 200, res.text)
            groups = res.json().get("groups") or []
            self.assertEqual([row["id"] for row in groups], ["postgresql/pgsql_etcd_cluster"])
            self.assertEqual(groups[0]["path"], ["postgresql", "pgsql_etcd_cluster"])
            self.assertEqual(groups[0]["hosts"][0]["vmid"], "5700")

    def test_save_preserves_vars_and_scales(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            project_id, leaf = self._fixture(Path(raw), HOSTS_K8S)
            listed = self.client.get(
                f"/api/projects/{project_id}/atlas/hosts",
                params={"cluster_id": "lab/k8s"},
                headers=headers,
            )
            groups = listed.json()["groups"]
            masters = next(row for row in groups if row["id"] == "k8s_masters")
            template = dict(masters["hosts"][0])
            template["ip"] = "192.168.1.226"
            template["hostname"] = "kubemaster02.example.com"
            template["vmid"] = "226"
            masters["hosts"].append(template)
            saved = self.client.put(
                f"/api/projects/{project_id}/atlas/hosts",
                json={"cluster_id": "lab/k8s", "groups": groups},
                headers=headers,
            )
            self.assertEqual(saved.status_code, 200, saved.text)
            body = saved.json()
            scaled = next(row for row in body["groups"] if row["id"] == "k8s_masters")
            self.assertEqual(
                [host["ip"] for host in scaled["hosts"]],
                ["192.168.1.225", "192.168.1.226"],
            )
            text = (leaf / "hosts").read_text(encoding="utf-8")
            self.assertIn("ansible_ssh_user: localuser", text)
            self.assertIn("192.168.1.226", text)
            self.assertIn("kubemaster02.example.com", text)
            self.assertIn("k8s_lbs", text)
            self.assertIn("0x5000c500c35cd220", text)

    def test_put_requires_execute(self):
        gateway.user_service.create_user(
            username="limited-hosts",
            password="limited1",
            email=None,
            roles=[],
        )
        token = self.client.post(
            "/api/auth/login",
            json={"username": "limited-hosts", "password": "limited1"},
        ).json()["access_token"]
        limited = {"Authorization": f"Bearer {token}"}
        with tempfile.TemporaryDirectory() as raw:
            project_id, _leaf = self._fixture(Path(raw), HOSTS_K8S)
            listed = self.client.get(
                f"/api/projects/{project_id}/atlas/hosts",
                params={"cluster_id": "lab/k8s"},
                headers=self._login(),
            )
            groups = listed.json()["groups"]
            denied = self.client.put(
                f"/api/projects/{project_id}/atlas/hosts",
                json={"cluster_id": "lab/k8s", "groups": groups},
                headers=limited,
            )
            self.assertEqual(denied.status_code, 403, denied.text)
