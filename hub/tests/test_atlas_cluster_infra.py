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
for _key in ("ATLAS_CLUSTER_ROOT", "ATLAS_CLUSTERS_ROOT", "ATLAS_WORKSPACE_ROOT"):
    os.environ.pop(_key, None)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402

HOSTS_YAML = """
all:
  children:
    k8s_lbs:
      hosts:
        192.168.1.220:
          hostname: lb1.example
"""

CLUSTER_YAML = """
id: dev/k8s
playbooks:
  atlas-k8s-core:
    source: git
    layout: roles/
    path: atlas-k8s-core
    path_relative_to: sibling
    entries:
      init:
        file: playbooks/init_nodes.yaml
  atlas-compute-provision:
    entries:
      provision:
        file: playbooks/provision_nodes.yaml
        invocations:
        - tags: 00_ensure_workspace
        - tags: 00_validate_provision,10_tf_apply
        - tags: 00_ensure_workspace
phases:
- provision: atlas-compute-provision/provision
- k8s-addons: atlas-k8s-addons/addons
"""

PLAYBOOK_YAML = "- hosts: all\n  tasks:\n    - ping:\n"


class AtlasClusterInfraTests(unittest.TestCase):
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

    def _fixture(self, tmp: Path) -> tuple[Path, Path, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text("#!/bin/sh\necho '{}'\n", encoding="utf-8")
        binary.chmod(0o755)
        sibling = tmp / "atlas-k8s-core"
        role = sibling / "roles" / "00_init" / "tasks"
        role.mkdir(parents=True)
        (role / "main.yml").write_text("---\n- ping:\n", encoding="utf-8")
        playbooks = sibling / "playbooks"
        playbooks.mkdir()
        (playbooks / "init_nodes.yaml").write_text(PLAYBOOK_YAML, encoding="utf-8")
        (sibling / "README.md").write_text("# atlas-k8s-core\n\nRole README.\n", encoding="utf-8")
        docs = sibling / "docs"
        docs.mkdir()
        (docs / "guide.md").write_text("# Guide\n\nCore guide.\n", encoding="utf-8")
        leaf = tmp / "inventory" / "clusters" / "dev" / "k8s"
        leaf.mkdir(parents=True)
        (leaf / "hosts").write_text(HOSTS_YAML, encoding="utf-8")
        (leaf / "cluster.yaml").write_text(CLUSTER_YAML, encoding="utf-8")
        group_vars = leaf / "group_vars"
        group_vars.mkdir()
        (group_vars / "all.yml").write_text("ntp_server: pool.ntp.org\n", encoding="utf-8")
        other = tmp / "inventory" / "clusters" / "prod" / "api"
        other.mkdir(parents=True)
        (other / "cluster.yaml").write_text("id: prod/api\n", encoding="utf-8")
        (other / "hosts").write_text(
            "all:\n  children:\n    api:\n      hosts:\n        10.0.0.1:\n",
            encoding="utf-8",
        )
        return ctl, tmp / "inventory" / "clusters", leaf

    def _atlas_project(self, headers, ctl: Path, clusters: Path, name: str):
        created = self.client.post(
            "/api/projects",
            json={
                "name": name,
                "kind": "atlas",
                "cluster_id": "dev/k8s",
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
        return project_id

    def test_playbook_workspace_clone_dirs_prefers_cluster_leaf(self):
        from atlas_cluster_fs import playbook_workspace_clone_dirs

        dirs = playbook_workspace_clone_dirs(
            Path("/ws"), "atlas-k8s-core", "dev/k8s"
        )
        self.assertEqual(
            [str(path) for path in dirs],
            [
                "/ws/dev/k8s/repos/atlas-k8s-core",
                "/ws/repos/atlas-k8s-core",
            ],
        )

    def test_inventory_hosts_and_vars_from_leaf(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters, leaf = self._fixture(tmp)
            project_id = self._atlas_project(headers, ctl, clusters, "atlas-leaf-inv")
            q = f"project_id={project_id}&cluster_id=dev/k8s"
            listed = self.client.get(f"/api/inventory/hosts?{q}", headers=headers)
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual(listed.json().get("hosts"), ["192.168.1.220"])
            files = self.client.get(f"/api/inventory/list?{q}", headers=headers)
            self.assertEqual(files.status_code, 200, files.text)
            names = [row.get("name") for row in files.json().get("files") or []]
            self.assertIn("hosts", names)
            self.assertNotIn("cluster.yaml", names)
            self.assertFalse((leaf / "host_vars").exists())
            vars_res = self.client.get(
                f"/api/inventory/vars?{q}&kind=group", headers=headers
            )
            self.assertEqual(vars_res.status_code, 200, vars_res.text)
            paths = [row.get("path") for row in vars_res.json().get("files") or []]
            self.assertIn("group_vars/all.yml", paths)
            switched = self.client.get(
                f"/api/inventory/hosts?project_id={project_id}&cluster_id=prod/api",
                headers=headers,
            )
            self.assertEqual(switched.status_code, 200, switched.text)
            self.assertEqual(switched.json().get("hosts"), ["10.0.0.1"])

    def test_roles_and_playbooks_from_cluster_yaml(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters, _leaf = self._fixture(tmp)
            project_id = self._atlas_project(headers, ctl, clusters, "atlas-leaf-roles")
            q = f"project_id={project_id}&cluster_id=dev/k8s"
            roles = self.client.get(f"/api/roles/storage?{q}", headers=headers)
            self.assertEqual(roles.status_code, 200, roles.text)
            tree = roles.json().get("tree") or []
            self.assertTrue(tree)
            self.assertEqual(tree[0].get("id"), "atlas-k8s-core")
            children = tree[0].get("children") or []
            self.assertTrue(any(row.get("name") == "00_init" for row in children))
            files = self.client.get(
                f"/api/roles/files/atlas-k8s-core/00_init?{q}",
                headers=headers,
            )
            self.assertEqual(files.status_code, 200, files.text)
            self.assertTrue(files.json().get("files"))
            playbooks = self.client.get(
                f"/api/projects/{project_id}/playbooks?cluster_id=dev/k8s",
                headers=headers,
            )
            self.assertEqual(playbooks.status_code, 200, playbooks.text)
            rows = playbooks.json().get("playbooks") or []
            self.assertTrue(any(row.get("id") == "atlas-k8s-core:init" for row in rows))
            got = self.client.get(
                f"/api/projects/{project_id}/playbooks/atlas-k8s-core:init",
                params={"cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(got.status_code, 200, got.text)
            self.assertIn("ping", got.json().get("playbook", {}).get("yaml") or "")
            saved = self.client.put(
                f"/api/projects/{project_id}/playbooks/atlas-k8s-core:init",
                params={"cluster_id": "dev/k8s"},
                json={"yaml": "- hosts: all\n  tasks:\n    - debug: msg=ok\n"},
                headers=headers,
            )
            self.assertEqual(saved.status_code, 200, saved.text)
            create = self.client.post(
                f"/api/projects/{project_id}/playbooks",
                json={"name": "nope"},
                headers=headers,
            )
            self.assertEqual(create.status_code, 400, create.text)
            run = self.client.post(
                f"/api/projects/{project_id}/playbooks/atlas-k8s-core:init/run",
                json={},
                headers=headers,
            )
            self.assertEqual(run.status_code, 400, run.text)

    def test_roles_from_workspace_cluster_clone(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters, _leaf = self._fixture(tmp)
            shutil.rmtree(tmp / "atlas-k8s-core")
            workspace = tmp / "workspace"
            role = (
                workspace
                / "dev"
                / "k8s"
                / "repos"
                / "atlas-k8s-core"
                / "roles"
                / "00_init"
                / "tasks"
            )
            role.mkdir(parents=True)
            (role / "main.yml").write_text("---\n- ping:\n", encoding="utf-8")
            project_id = self._atlas_project(
                headers, ctl, clusters, "atlas-ws-clone-roles"
            )
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"workspaceRoot": str(workspace)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            q = f"project_id={project_id}&cluster_id=dev/k8s"
            roles = self.client.get(f"/api/roles/storage?{q}", headers=headers)
            self.assertEqual(roles.status_code, 200, roles.text)
            tree = roles.json().get("tree") or []
            self.assertTrue(tree)
            self.assertEqual(tree[0].get("id"), "atlas-k8s-core")
            children = tree[0].get("children") or []
            self.assertTrue(any(row.get("name") == "00_init" for row in children))
            missing_parent = self.client.get(
                f"/api/roles/storage?project_id={project_id}&cluster_id=prod/api",
                headers=headers,
            )
            self.assertEqual(missing_parent.status_code, 200, missing_parent.text)
            self.assertEqual(missing_parent.json().get("tree") or [], [])

    def test_role_handbook_readme_and_docs(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters, _leaf = self._fixture(tmp)
            project_id = self._atlas_project(
                headers, ctl, clusters, "atlas-leaf-handbook"
            )
            q = f"project_id={project_id}&cluster_id=dev/k8s"
            listed = self.client.get(f"/api/roles/handbook?{q}", headers=headers)
            self.assertEqual(listed.status_code, 200, listed.text)
            packs = listed.json().get("packs") or []
            self.assertTrue(packs)
            self.assertEqual(packs[0].get("id"), "atlas-k8s-core")
            paths = [row.get("path") for row in packs[0].get("files") or []]
            self.assertIn("README.md", paths)
            self.assertIn("docs/guide.md", paths)
            readme = self.client.get(
                f"/api/roles/handbook/file?{q}&pack=atlas-k8s-core&doc=README.md",
                headers=headers,
            )
            self.assertEqual(readme.status_code, 200, readme.text)
            self.assertIn("Role README", readme.json().get("markdown") or "")
            guide = self.client.get(
                f"/api/roles/handbook/file?{q}&pack=atlas-k8s-core&doc=docs/guide.md",
                headers=headers,
            )
            self.assertEqual(guide.status_code, 200, guide.text)
            self.assertIn("Core guide", guide.json().get("markdown") or "")
            denied = self.client.get(
                f"/api/roles/handbook/file?{q}&pack=atlas-k8s-core&doc=../SECRET.md",
                headers=headers,
            )
            self.assertEqual(denied.status_code, 400, denied.text)
            missing = self.client.get(
                f"/api/roles/handbook?project_id={project_id}&cluster_id=nope/none",
                headers=headers,
            )
            self.assertEqual(missing.status_code, 200, missing.text)
            self.assertEqual(missing.json().get("packs"), [])

    def test_cluster_yaml_get_put(self):
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters, leaf = self._fixture(tmp)
            project_id = self._atlas_project(headers, ctl, clusters, "atlas-leaf-yaml")
            got = self.client.get(
                f"/api/projects/{project_id}/atlas/cluster-yaml",
                params={"cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(got.status_code, 200, got.text)
            body = got.json()
            self.assertEqual(body.get("cluster_id"), "dev/k8s")
            self.assertIn("atlas-k8s-core", body.get("content") or "")
            names = [row.get("name") for row in body.get("playbooks") or []]
            self.assertIn("atlas-k8s-core", names)
            core = next(
                row
                for row in body.get("playbooks") or []
                if row.get("name") == "atlas-k8s-core"
            )
            self.assertIn("init", core.get("entries") or [])
            aliases = [row.get("alias") for row in body.get("phases") or []]
            self.assertIn("k8s-addons", aliases)
            self.assertEqual(aliases[-1], "k8s-addons")
            provision = next(
                row
                for row in body.get("phases") or []
                if row.get("alias") == "provision"
            )
            self.assertEqual(
                provision.get("tags"),
                ["00_ensure_workspace", "00_validate_provision", "10_tf_apply"],
            )
            addons = next(
                row
                for row in body.get("phases") or []
                if row.get("alias") == "k8s-addons"
            )
            self.assertEqual(addons.get("tags"), [])
            next_yaml = "id: dev/k8s\nplaybooks: {}\n"
            saved = self.client.put(
                f"/api/projects/{project_id}/atlas/cluster-yaml",
                params={"cluster_id": "dev/k8s"},
                json={"content": next_yaml},
                headers=headers,
            )
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(
                (leaf / "cluster.yaml").read_text(encoding="utf-8"),
                next_yaml if next_yaml.endswith("\n") else next_yaml + "\n",
            )
            switched = self.client.get(
                f"/api/projects/{project_id}/atlas/cluster-yaml",
                params={"cluster_id": "prod/api"},
                headers=headers,
            )
            self.assertEqual(switched.status_code, 200, switched.text)
            self.assertIn("prod/api", switched.json().get("content") or "")
            bad = self.client.put(
                f"/api/projects/{project_id}/atlas/cluster-yaml",
                params={"cluster_id": "dev/k8s"},
                json={"content": "id: [\n"},
                headers=headers,
            )
            self.assertEqual(bad.status_code, 400, bad.text)

    def test_ansible_project_unchanged(self):
        headers = self._login()
        created = self.client.post(
            "/api/projects",
            json={"name": "ansible-leaf-skip", "kind": "ansible"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        listed = self.client.get(
            f"/api/inventory/hosts?project_id={project_id}&cluster_id=dev/k8s",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json().get("hosts"), [])
        yaml_get = self.client.get(
            f"/api/projects/{project_id}/atlas/cluster-yaml",
            params={"cluster_id": "dev/k8s"},
            headers=headers,
        )
        self.assertEqual(yaml_get.status_code, 400, yaml_get.text)
        yaml_put = self.client.put(
            f"/api/projects/{project_id}/atlas/cluster-yaml",
            json={"content": "id: x\n", "cluster_id": "dev/k8s"},
            headers=headers,
        )
        self.assertEqual(yaml_put.status_code, 400, yaml_put.text)


if __name__ == "__main__":
    unittest.main()
