import sys
from pathlib import Path as _AuthEnvPath

sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"
for _key in ("ATLAS_CLUSTER_ROOT", "ATLAS_CLUSTERS_ROOT", "ATLAS_WORKSPACE_ROOT"):
    os.environ.pop(_key, None)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
import atlas_vars_setup  # noqa: E402
from atlas_vars_setup import (  # noqa: E402
    comment_above,
    comments_above_index,
    is_pve_factory_cluster,
    pve_templates_block,
    remove_top_level_key,
    set_top_level_block,
    set_top_level_key,
    top_level_span,
)

PVE_CLUSTER = """
id: lab/pve
playbooks:
  atlas-compute-provision:
    entries:
      templates:
        file: playbooks/build_templates.yaml
"""

K8S_CLUSTER = """
id: lab/k8s
playbooks:
  atlas-compute-provision:
    entries:
      templates:
        file: playbooks/build_templates.yaml
      provision:
        file: playbooks/provision_nodes.yaml
  atlas-node-foundation:
    entries:
      init:
        file: playbooks/init_nodes.yaml
"""

INFRA_CLUSTER = """
id: lab/infra
playbooks:
  atlas-compute-provision:
    entries:
      provision:
        file: playbooks/provision_nodes.yaml
  atlas-node-foundation:
    entries:
      init:
        file: playbooks/init_nodes.yaml
  atlas-infra-edge:
    entries:
      infra:
        file: playbooks/infra.yaml
"""


class VarsSetupYamlTests(unittest.TestCase):
    def test_set_and_remove_preserves_neighbor_keys(self) -> None:
        text = "provision_gateway: 192.168.1.1\nprovision_pve_host: 10.0.0.1\n"
        updated = set_top_level_key(text, "provision_gateway", "192.168.1.2")
        self.assertIn("provision_gateway: 192.168.1.2", updated)
        self.assertIn("provision_pve_host: 10.0.0.1", updated)
        removed = remove_top_level_key(updated, "provision_gateway")
        self.assertNotIn("provision_gateway:", removed)
        self.assertIn("provision_pve_host: 10.0.0.1", removed)

    def test_replace_nested_block(self) -> None:
        text = (
            "provision_pve_templates:\n"
            "  ubuntu-base:\n"
            "    id: 1\n"
            "other: 1\n"
        )
        block = pve_templates_block(
            {
                "ubuntu-base": {"id": 400100, "image_url": "https://example.com/u.img"},
                "oracle-base": {"id": 400101, "image_url": "https://example.com/o.qcow2"},
                "debian-base": {"id": 400102, "image_url": "https://example.com/d.qcow2"},
            }
        )
        next_text = set_top_level_block(text, "provision_pve_templates", block)
        self.assertIn("id: 400100", next_text)
        self.assertIn("other: 1", next_text)
        self.assertEqual(next_text.count("provision_pve_templates:"), 1)

    def test_pve_templates_backup_written_only_when_set(self) -> None:
        block = pve_templates_block(
            {
                "ubuntu-base": {
                    "id": 400100,
                    "image_url": "https://example.com/u.img",
                    "image_url_backup": "https://mirror.example/u.img",
                },
                "oracle-base": {
                    "id": 400101,
                    "image_url": "https://example.com/o.qcow2",
                    "image_url_backup": "  ",
                },
                "debian-base": {
                    "id": 400102,
                    "image_url": "https://example.com/d.qcow2",
                },
            }
        )
        text = "\n".join(block)
        self.assertEqual(text.count("image_url_backup:"), 1)
        self.assertIn("https://mirror.example/u.img", text)

    def test_string_list_block_and_stringify(self) -> None:
        block = atlas_vars_setup.string_list_block(
            "pki_ca_url",
            [
                "https://ca.dev-mxhash.com:8443/roots.pem",
                "https://ca.mxhash.com:8443/roots.pem",
            ],
        )
        self.assertEqual(block[0], "pki_ca_url:")
        self.assertIn("https://ca.dev-mxhash.com:8443/roots.pem", block[1])
        self.assertEqual(
            atlas_vars_setup.stringify_value(["192.168.1.219", "pool.ntp.org"]),
            "192.168.1.219\npool.ntp.org",
        )
        empty = atlas_vars_setup.string_list_block("ntp_servers", [])
        self.assertEqual(empty, ["ntp_servers: []"])
        text = "ntp_servers:\n  - 1.1.1.1\nother: 1\n"
        next_text = set_top_level_block(
            text, "ntp_servers", atlas_vars_setup.string_list_block("ntp_servers", ["192.168.1.219"])
        )
        self.assertIn("192.168.1.219", next_text)
        self.assertIn("other: 1", next_text)
        self.assertEqual(next_text.count("ntp_servers:"), 1)

    def test_pve_factory_heuristic(self) -> None:
        import yaml

        pve = yaml.safe_load(PVE_CLUSTER)
        k8s = yaml.safe_load(K8S_CLUSTER)
        self.assertTrue(is_pve_factory_cluster(pve))
        self.assertFalse(is_pve_factory_cluster(k8s))

    def test_comments_above_index_matches_span_walk(self) -> None:
        text = (
            "# ====================\n"
            "# Targeting\n"
            "# ====================\n"
            "\n"
            "# Leaf DNS identity\n"
            "# duplicated into atlas overlays\n"
            "dns_domain_suffix: example.com\n"
            "cluster_domain: infra.example.com\n"
            "bind_options:\n"
            "  recursion: yes\n"
            "# NTP pool\n"
            "ntp_servers:\n"
            "  - 1.pool.ntp.org\n"
        )

        def legacy(key: str) -> str:
            lines = text.split("\n")
            span = top_level_span(lines, key)
            if span is None:
                return ""
            block: list[str] = []
            for cursor in range(span[0] - 1, -1, -1):
                previous = lines[cursor]
                if not previous.strip().startswith("#"):
                    break
                block.insert(0, previous.strip().lstrip("#").strip())
            return " ".join(
                part for part in block if part and not re.fullmatch(r"[-=#]{3,}", part)
            )

        index = comments_above_index(text)
        for key in (
            "dns_domain_suffix",
            "cluster_domain",
            "bind_options",
            "ntp_servers",
        ):
            self.assertEqual(index.get(key, ""), legacy(key), key)
            self.assertEqual(comment_above(text, key), legacy(key), key)
        self.assertEqual(
            index["dns_domain_suffix"],
            "Leaf DNS identity duplicated into atlas overlays",
        )
        self.assertEqual(index["ntp_servers"], "NTP pool")
        self.assertEqual(index["cluster_domain"], "")

    def test_inline_comment_overrides_block_above(self) -> None:
        text = (
            "# Leaf DNS identity\n"
            "dns_domain_suffix: dev-mxhash.com # Suffix for every lab hostname\n"
            "k8s_api_port: 6443\n"
        )
        self.assertEqual(
            comment_above(text, "dns_domain_suffix"),
            "Suffix for every lab hostname",
        )
        self.assertEqual(comment_above(text, "k8s_api_port"), "")


class VarsSetupParseOnceTests(unittest.TestCase):
    def test_file_descriptor_loads_each_layer_once(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            env = tmp / "env"
            leaf = tmp / "leaf"
            rel = "group_vars/all/atlas-infra-edge.yml"
            (env / "group_vars" / "all").mkdir(parents=True)
            (leaf / "group_vars" / "all").mkdir(parents=True)
            chunks = ["# Leaf DNS\ndns_domain_suffix: example.com\n"]
            for index in range(90):
                chunks.append(f"key_{index}: value_{index}\n")
            chunks.append("bind_options:\n  recursion: yes\n  extra: 1\n")
            (env / rel).write_text("".join(chunks), encoding="utf-8")
            (leaf / rel).write_text("key_0: override\n", encoding="utf-8")
            layers = [("env", env), ("leaf", leaf)]
            loads: list[str] = []
            real = atlas_vars_setup._load_mapping

            def counting(path: Path):
                loads.append(str(path))
                return real(path)

            with patch.object(atlas_vars_setup, "_load_mapping", counting):
                desc = atlas_vars_setup._file_descriptor(rel, layers)

            self.assertEqual(len(loads), 2)
            self.assertEqual(desc["keys"]["key_0"]["origin"], "leaf")
            self.assertEqual(desc["keys"]["key_0"]["value"], "override")
            self.assertEqual(desc["keys"]["key_1"]["origin"], "env")
            self.assertNotIn("comment", desc["keys"]["dns_domain_suffix"])
            self.assertNotIn("comment", desc["nested"]["bind_options"])
            self.assertEqual(desc["nested"]["bind_options"]["origin"], "env")

            reads: list[str] = []
            real_read = Path.read_text

            def counting_read(self, *args, **kwargs):
                reads.append(str(self))
                return real_read(self, *args, **kwargs)

            with patch.object(Path, "read_text", counting_read):
                atlas_vars_setup._attach_origin_comments(desc, layers, rel)

            self.assertEqual(len(reads), 2)
            self.assertEqual(desc["keys"]["dns_domain_suffix"]["comment"], "Leaf DNS")
            self.assertEqual(desc["keys"]["key_0"]["comment"], "")
            self.assertEqual(desc["nested"]["bind_options"]["comment"], "")

    def test_borrows_dns_address_from_default_compute_file(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            env = tmp / "lab" / "default"
            leaf = tmp / "lab" / "k8s"
            (env / "group_vars" / "all").mkdir(parents=True)
            (leaf / "group_vars" / "all").mkdir(parents=True)
            (env / "group_vars" / "all" / "atlas-compute-provision.yml").write_text(
                "dns_server_ip: 192.168.1.219\n",
                encoding="utf-8",
            )
            core = leaf / "group_vars" / "all" / "atlas-k8s-core.yml"
            core.write_text("vip_address: 192.168.1.210\n", encoding="utf-8")
            (leaf / "cluster.yaml").write_text("id: lab/k8s\n", encoding="utf-8")
            layers = [("env", env), ("leaf", leaf)]
            rel = "group_vars/all/atlas-k8s-core.yml"
            desc = atlas_vars_setup._file_descriptor(rel, layers)
            self.assertEqual(desc["keys"]["dns_server_ip"]["origin"], "env")
            self.assertEqual(desc["keys"]["dns_server_ip"]["value"], "192.168.1.219")

            with patch.object(
                atlas_vars_setup,
                "_require_leaf",
                return_value=(leaf, "lab/k8s"),
            ):
                atlas_vars_setup.put_vars_setup_file(
                    "project",
                    rel,
                    cluster_id="lab/k8s",
                    updates={"dns_server_ip": "192.168.1.219"},
                )
            self.assertNotIn("dns_server_ip", core.read_text(encoding="utf-8"))

            with patch.object(
                atlas_vars_setup,
                "_require_leaf",
                return_value=(leaf, "lab/k8s"),
            ):
                atlas_vars_setup.put_vars_setup_file(
                    "project",
                    rel,
                    cluster_id="lab/k8s",
                    updates={"dns_server_ip": "192.168.1.50"},
                )
            self.assertIn("dns_server_ip: 192.168.1.50", core.read_text(encoding="utf-8"))


class VarsSetupHttpTests(unittest.TestCase):
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

    def _fixture(self, tmp: Path) -> tuple[Path, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text("#!/bin/sh\necho '{}'\n", encoding="utf-8")
        binary.chmod(0o755)
        clusters = tmp / "inventory" / "clusters"
        env_default = clusters / "lab" / "default"
        env_all = env_default / "group_vars" / "all"
        env_all.mkdir(parents=True)
        (env_default / "cluster.yaml").write_text("id: lab/default\n", encoding="utf-8")
        (env_all / "atlas-compute-provision.yml").write_text(
            "# Cluster default gateway\n"
            "provision_gateway: 192.168.1.1\n"
            "provision_pve_host: 192.168.1.20\n"
            "provision_pve_user: root\n"
            "provision_proxmox_target_node: pve\n"
            "provision_pve_inventory_name: pve\n"
            "provision_pve_inventory_group: proxmox\n"
            "provision_vm_full_clone: false\n"
            "provision_vm_cloudinit_storage: local-zfs\n"
            "provision_vm_network_bridge: vmbr0\n"
            "provision_ssh_public_key_file: key.pub\n"
            "provision_pve_upload_dir: ''\n"
            "provision_tf_state_git_push: true\n",
            encoding="utf-8",
        )
        (env_all / "atlas-compute-provision.secrets.yml").write_text(
            "provision_pve_ssh_password: secret\n"
            "provision_proxmox_token_id: user@pam!token\n"
            "provision_proxmox_token_secret: tok\n"
            "provision_dns_key_secret: dns\n"
            "provision_vm_cipassword: ci\n",
            encoding="utf-8",
        )
        (env_all / "atlas-node-foundation.yml").write_text(
            "dns_domain_suffix: example.com\n",
            encoding="utf-8",
        )
        leaf = clusters / "lab" / "pve"
        leaf.mkdir(parents=True)
        (leaf / "cluster.yaml").write_text(PVE_CLUSTER, encoding="utf-8")
        (leaf / "hosts").write_text("all:\n  children: {}\n", encoding="utf-8")
        leaf_all = leaf / "group_vars" / "all"
        leaf_all.mkdir(parents=True)
        (leaf_all / "atlas-compute-provision.yml").write_text(
            "provision_pve_templates:\n"
            "  ubuntu-base:\n"
            "    id: 400100\n"
            "    image_url: https://example.com/u.img\n"
            "  oracle-base:\n"
            "    id: 400101\n"
            "    image_url: https://example.com/o.qcow2\n"
            "  debian-base:\n"
            "    id: 400102\n"
            "    image_url: https://example.com/d.qcow2\n",
            encoding="utf-8",
        )
        (leaf / "group_vars" / "proxmox.yml").write_text(
            'ansible_host: "{{ provision_pve_host }}"\n'
            'ansible_user: "{{ provision_pve_user }}"\n',
            encoding="utf-8",
        )
        return ctl, clusters

    def _project(self, headers, ctl: Path, clusters: Path, name: str) -> str:
        created = self.client.post(
            "/api/projects",
            json={
                "name": name,
                "kind": "atlas",
                "cluster_id": "lab/pve",
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

    def test_list_hides_node_foundation_and_shows_cascade_secrets(self) -> None:
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._fixture(tmp)
            project_id = self._project(headers, ctl, clusters, "vars-setup-pve")
            q = f"project_id={project_id}&cluster_id=lab/pve"
            res = self.client.get(f"/api/atlas/vars-setup?{q}", headers=headers)
            self.assertEqual(res.status_code, 200, res.text)
            data = res.json()
            self.assertTrue(data.get("pveFactory"))
            self.assertTrue(data.get("hasEnvLayer"))
            names = [row["name"] for row in data.get("files") or []]
            self.assertEqual(
                names,
                [
                    "atlas-compute-provision.yml",
                    "atlas-compute-provision.secrets.yml",
                ],
            )
            compute = next(
                row
                for row in data["files"]
                if row["name"] == "atlas-compute-provision.yml"
            )
            self.assertEqual(compute["keys"]["provision_gateway"]["origin"], "env")
            self.assertNotIn("fileMeta", compute)
            self.assertEqual(compute["keys"]["provision_gateway"]["value"], "192.168.1.1")
            self.assertNotIn("comment", compute["keys"]["provision_gateway"])
            self.assertEqual(
                compute["nested"]["provision_pve_templates"]["origin"], "leaf"
            )
            self.assertNotIn("comment", compute["nested"]["provision_pve_templates"])
            secrets = next(
                row
                for row in data["files"]
                if row["name"] == "atlas-compute-provision.secrets.yml"
            )
            self.assertEqual(
                secrets["keys"]["provision_pve_ssh_password"]["origin"], "env"
            )

    def test_save_env_key_and_local_global(self) -> None:
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._fixture(tmp)
            project_id = self._project(headers, ctl, clusters, "vars-setup-layers")
            path = "group_vars/all/atlas-compute-provision.yml"
            env_file = clusters / "lab" / "default" / path
            leaf_file = clusters / "lab" / "pve" / path
            save = self.client.put(
                "/api/atlas/vars-setup/file",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/pve",
                    "path": path,
                    "updates": {"provision_gateway": "10.0.0.1"},
                },
            )
            self.assertEqual(save.status_code, 200, save.text)
            self.assertIn("provision_gateway: 10.0.0.1", env_file.read_text(encoding="utf-8"))
            self.assertNotIn("provision_gateway:", leaf_file.read_text(encoding="utf-8"))

            local = self.client.post(
                "/api/atlas/vars-setup/layer",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/pve",
                    "path": path,
                    "key": "provision_gateway",
                    "action": "local",
                    "value": "10.0.0.1",
                },
            )
            self.assertEqual(local.status_code, 200, local.text)
            self.assertIn("provision_gateway: 10.0.0.1", leaf_file.read_text(encoding="utf-8"))
            self.assertEqual(local.json()["keys"]["provision_gateway"]["origin"], "leaf")

            globalize = self.client.post(
                "/api/atlas/vars-setup/layer",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/pve",
                    "path": path,
                    "key": "provision_gateway",
                    "action": "global",
                    "value": "10.1.1.1",
                },
            )
            self.assertEqual(globalize.status_code, 200, globalize.text)
            self.assertNotIn("provision_gateway:", leaf_file.read_text(encoding="utf-8"))
            self.assertIn("provision_gateway: 10.1.1.1", env_file.read_text(encoding="utf-8"))
            self.assertEqual(globalize.json()["keys"]["provision_gateway"]["origin"], "env")

    def test_file_get_attaches_origin_comments(self) -> None:
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._fixture(tmp)
            project_id = self._project(headers, ctl, clusters, "vars-setup-comments")
            path = "group_vars/all/atlas-compute-provision.yml"
            res = self.client.get(
                "/api/atlas/vars-setup/file",
                headers=headers,
                params={
                    "project_id": project_id,
                    "cluster_id": "lab/pve",
                    "path": path,
                },
            )
            self.assertEqual(res.status_code, 200, res.text)
            data = res.json()
            self.assertEqual(
                data["keys"]["provision_gateway"]["comment"],
                "Cluster default gateway",
            )
            self.assertEqual(data["keys"]["provision_gateway"]["origin"], "env")
            self.assertEqual(
                data["nested"]["provision_pve_templates"]["origin"], "leaf"
            )
            self.assertEqual(data["nested"]["provision_pve_templates"]["comment"], "")
            meta = data["fileMeta"]
            self.assertTrue(
                str(meta["absolutePath"]).endswith(
                    "lab/pve/group_vars/all/atlas-compute-provision.yml"
                )
            )
            self.assertTrue(meta["modifiedAt"])
            self.assertIsNone(meta["createdAt"])
            self.assertIsNone(meta["editedBy"])

    def test_put_writes_yaml_list(self) -> None:
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._fixture(tmp)
            project_id = self._project(headers, ctl, clusters, "vars-setup-lists")
            path = "group_vars/all/atlas-compute-provision.yml"
            save = self.client.put(
                "/api/atlas/vars-setup/file",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/pve",
                    "path": path,
                    "updates": {
                        "ntp_servers": ["192.168.1.219", "pool.ntp.org"],
                    },
                },
            )
            self.assertEqual(save.status_code, 200, save.text)
            self.assertEqual(
                save.json()["keys"]["ntp_servers"]["value"],
                "192.168.1.219\npool.ntp.org",
            )
            text = (clusters / "lab" / "pve" / path).read_text(encoding="utf-8")
            self.assertIn("ntp_servers:", text)
            self.assertIn("192.168.1.219", text)
            self.assertIn("pool.ntp.org", text)
            self.assertNotIn("['192.168.1.219'", text)

    def _dns_fixture(self, tmp: Path) -> tuple[Path, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text("#!/bin/sh\necho '{}'\n", encoding="utf-8")
        binary.chmod(0o755)
        clusters = tmp / "inventory" / "clusters"
        env_all = clusters / "lab" / "default" / "group_vars" / "all"
        env_all.mkdir(parents=True)
        (clusters / "lab" / "default" / "cluster.yaml").write_text(
            "id: lab/default\n", encoding="utf-8"
        )
        dns = (
            "dns_domain_suffix: example.com\n"
            'cluster_domain: "infra.{{ dns_domain_suffix }}"\n'
        )
        (env_all / "atlas-compute-provision.yml").write_text(dns, encoding="utf-8")
        (env_all / "atlas-node-foundation.yml").write_text(dns, encoding="utf-8")
        (env_all / "atlas-infra-edge.yml").write_text(dns, encoding="utf-8")
        (env_all / "atlas-node-foundation.secrets.yml").write_text(
            "initial_password: secret\n",
            encoding="utf-8",
        )
        leaf = clusters / "lab" / "infra"
        leaf.mkdir(parents=True)
        (leaf / "cluster.yaml").write_text(INFRA_CLUSTER, encoding="utf-8")
        (leaf / "hosts").write_text("all:\n  children: {}\n", encoding="utf-8")
        return ctl, clusters

    def test_dns_domain_suffix_fans_out_across_overlays(self) -> None:
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._dns_fixture(tmp)
            project_id = self._project(headers, ctl, clusters, "vars-setup-dns")
            env_all = clusters / "lab" / "default" / "group_vars" / "all"
            leaf_all = clusters / "lab" / "infra" / "group_vars" / "all"
            overlays = (
                "atlas-compute-provision.yml",
                "atlas-node-foundation.yml",
                "atlas-infra-edge.yml",
            )
            save = self.client.put(
                "/api/atlas/vars-setup/file",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/infra",
                    "path": "group_vars/all/atlas-node-foundation.yml",
                    "updates": {"dns_domain_suffix": "dev-mxhash.com"},
                },
            )
            self.assertEqual(save.status_code, 200, save.text)
            for name in overlays:
                text = (env_all / name).read_text(encoding="utf-8")
                self.assertIn("dns_domain_suffix: dev-mxhash.com", text, name)
                self.assertIn("infra.{{ dns_domain_suffix }}", text, name)
            secrets = (env_all / "atlas-node-foundation.secrets.yml").read_text(
                encoding="utf-8"
            )
            self.assertNotIn("dns_domain_suffix", secrets)

            local = self.client.post(
                "/api/atlas/vars-setup/layer",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/infra",
                    "path": "group_vars/all/atlas-node-foundation.yml",
                    "key": "dns_domain_suffix",
                    "action": "local",
                    "value": "dev-mxhash.com",
                },
            )
            self.assertEqual(local.status_code, 200, local.text)
            self.assertEqual(local.json()["keys"]["dns_domain_suffix"]["origin"], "leaf")
            for name in overlays:
                self.assertIn(
                    "dns_domain_suffix: dev-mxhash.com",
                    (leaf_all / name).read_text(encoding="utf-8"),
                    name,
                )

            globalize = self.client.post(
                "/api/atlas/vars-setup/layer",
                headers=headers,
                json={
                    "project_id": project_id,
                    "cluster_id": "lab/infra",
                    "path": "group_vars/all/atlas-compute-provision.yml",
                    "key": "dns_domain_suffix",
                    "action": "global",
                    "value": "lab.example.com",
                },
            )
            self.assertEqual(globalize.status_code, 200, globalize.text)
            self.assertEqual(
                globalize.json()["keys"]["dns_domain_suffix"]["origin"], "env"
            )
            for name in overlays:
                self.assertIn(
                    "dns_domain_suffix: lab.example.com",
                    (env_all / name).read_text(encoding="utf-8"),
                    name,
                )
                leaf_text = (leaf_all / name).read_text(encoding="utf-8")
                self.assertNotIn("dns_domain_suffix:", leaf_text, name)

    def test_reuse_returns_saved_secret_and_skips_changeme(self) -> None:
        headers = self._login()
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl = tmp / "atlas-clusterctl"
            ctl.mkdir()
            binary = ctl / "cluster"
            binary.write_text("#!/bin/sh\necho '{}'\n", encoding="utf-8")
            binary.chmod(0o755)
            clusters = tmp / "inventory" / "clusters"
            infra = clusters / "lab" / "infra"
            k8s = clusters / "lab" / "k8s"
            for leaf, cid in ((infra, "lab/infra"), (k8s, "lab/k8s")):
                leaf.mkdir(parents=True)
                (leaf / "cluster.yaml").write_text(f"id: {cid}\n", encoding="utf-8")
            infra_vars = infra / "group_vars" / "all"
            infra_vars.mkdir(parents=True)
            (infra_vars / "atlas-infra-edge.secrets.yml").write_text(
                "provision_dns_key_secret: apex-from-infra\n"
                "external_dns_tsig_secret: CHANGEME\n"
                "bind_options:\n"
                "  secret: nested\n",
                encoding="utf-8",
            )
            k8s_vars = k8s / "group_vars" / "all"
            k8s_vars.mkdir(parents=True)
            (k8s_vars / "atlas-k8s-addons.secrets.yml").write_text(
                "external_dns_apex_tsig_secret: CHANGEME_APEX\n",
                encoding="utf-8",
            )
            created = self.client.post(
                "/api/projects",
                json={
                    "name": "vars-setup-reuse",
                    "kind": "atlas",
                    "cluster_id": "lab/k8s",
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
            res = self.client.get(
                "/api/atlas/vars-setup/reuse",
                headers=headers,
                params={
                    "project_id": project_id,
                    "cluster_id": "lab/k8s",
                    "keys": ",".join(
                        [
                            "provision_dns_key_secret",
                            "external_dns_apex_tsig_secret",
                            "k8s_lb_dns_key_secret",
                            "external_dns_tsig_secret",
                        ]
                    ),
                },
            )
            self.assertEqual(res.status_code, 200, res.text)
            options = res.json()["options"]
            self.assertEqual(
                [
                    {
                        "key": "provision_dns_key_secret",
                        "clusterId": "lab/infra",
                        "file": "group_vars/all/atlas-infra-edge.secrets.yml",
                        "origin": "leaf",
                        "value": "apex-from-infra",
                    }
                ],
                options,
            )
            blob = res.text
            self.assertNotIn("CHANGEME", blob)


class VarsSetupFileFactsTests(unittest.TestCase):
    def _git(self, repo: Path, *args: str) -> None:
        subprocess.run(
            ["git", *args],
            cwd=repo,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_leaf_copy_carries_git_author_and_created_date(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            rel = "group_vars/all/atlas-node-foundation.secrets.yml"
            env_dir = root / "clusters" / "lab" / "default"
            leaf_dir = root / "clusters" / "lab" / "k8s"
            env_file = env_dir / rel
            leaf_file = leaf_dir / rel
            env_file.parent.mkdir(parents=True)
            leaf_file.parent.mkdir(parents=True)
            env_file.write_text("initial_password: env\n", encoding="utf-8")
            self._git(root, "init")
            self._git(root, "add", rel.replace("group_vars", "clusters/lab/default/group_vars"))
            self._git(
                root,
                "-c",
                "user.email=env@example.com",
                "-c",
                "user.name=Env Author",
                "commit",
                "-m",
                "env",
            )
            leaf_file.write_text("initial_password: leaf\n", encoding="utf-8")
            self._git(root, "add", "clusters/lab/k8s/group_vars/all/atlas-node-foundation.secrets.yml")
            self._git(
                root,
                "-c",
                "user.email=leaf@example.com",
                "-c",
                "user.name=Leaf Author",
                "commit",
                "-m",
                "leaf",
            )
            layers = [("env", env_dir), ("leaf", leaf_dir)]
            facts = atlas_vars_setup._file_facts(atlas_vars_setup._overlay_file(layers, rel))
            self.assertEqual(facts["absolutePath"], str(leaf_file.resolve()))
            self.assertEqual(facts["editedBy"], "Leaf Author")
            self.assertTrue(facts["createdAt"])
            self.assertTrue(facts["modifiedAt"])
            self.assertIsNone(atlas_vars_setup._file_facts(None)["absolutePath"])


if __name__ == "__main__":
    unittest.main()
