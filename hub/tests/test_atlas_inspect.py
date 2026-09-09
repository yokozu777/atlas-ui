import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_inspect import (  # noqa: E402
    InspectError,
    assert_inspect_argv,
    clusterctl_root_from_params,
    inspect_atlas,
    list_atlas_inventory_clusters,
    list_inventory_cluster_ids,
    normalize_inventory_cluster_id,
    prepare_atlas_run,
    read_atlas_file,
    read_atlas_log,
    list_atlas_workspace,
    read_atlas_workspace_file,
    resolve_inspect_cluster_id,
)
from project_kind import ensure_project_layout  # noqa: E402


class InspectAllowlistTests(unittest.TestCase):
    def test_allows_readonly_plan(self):
        self.assertEqual(
            assert_inspect_argv(["plan", "--json"]),
            ["plan", "--json"],
        )

    def test_allows_workspace_show(self):
        assert_inspect_argv(["workspace", "show", "--json"])
        assert_inspect_argv(["config", "effective"])
        assert_inspect_argv(["repos", "status"])

    def test_rejects_run(self):
        with self.assertRaises(InspectError) as ctx:
            assert_inspect_argv(["run"])
        self.assertIn("run", str(ctx.exception))

    def test_rejects_run_after_cluster_flag(self):
        with self.assertRaises(InspectError):
            assert_inspect_argv(["--cluster", "dev/k8s", "run", "--dry-run"])

    def test_rejects_init_sync_reset(self):
        for argv in (
            ["init"],
            ["repos", "sync"],
            ["workspace", "reset"],
        ):
            with self.assertRaises(InspectError):
                assert_inspect_argv(argv)

    def test_rejects_empty(self):
        with self.assertRaises(InspectError):
            assert_inspect_argv([])


class InspectRuntimeTests(unittest.TestCase):
    def setUp(self):
        self._saved = {
            key: os.environ.get(key)
            for key in ("ATLAS_CLUSTER_ROOT", "ATLAS_CLUSTERS_ROOT", "ATLAS_WORKSPACE_ROOT")
        }
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        os.environ.pop("ATLAS_CLUSTERS_ROOT", None)
        os.environ.pop("ATLAS_WORKSPACE_ROOT", None)

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_empty_cluster_root_message(self):
        with self.assertRaises(InspectError) as ctx:
            clusterctl_root_from_params({})
        self.assertIn("ATLAS_CLUSTER_ROOT", str(ctx.exception))

    def test_inspect_empty_root(self):
        with self.assertRaises(InspectError) as ctx:
            inspect_atlas(["plan", "--json"], "dev/k8s")
        self.assertIn("ATLAS_CLUSTER_ROOT", str(ctx.exception))

    def _ctl(self, tmp: Path, script: str) -> tuple[Path, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text(script, encoding="utf-8")
        binary.chmod(0o755)
        leaf = tmp / "atlas-inventory" / "clusters" / "dev" / "k8s"
        leaf.mkdir(parents=True)
        (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
        return ctl, leaf

    def test_inspect_spawns_clusterctl_json(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _leaf = self._ctl(
                tmp,
                "#!/bin/sh\necho '{\"ok\":true}'\n",
            )
            result = inspect_atlas(
                ["plan", "--json"],
                "dev/k8s",
                {"clusterctl_root": str(ctl)},
            )
            self.assertEqual(result["return_code"], 0)
            self.assertEqual(result["json"], {"ok": True})
            self.assertIn("--cluster", result["argv"])
            self.assertIn("plan", result["argv"])

    def test_inspect_does_not_create_playbooks(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _leaf = self._ctl(tmp, "#!/bin/sh\necho '{}'\n")
            project_dir = tmp / "projects" / "p1"
            project_dir.mkdir(parents=True)
            ensure_project_layout(project_dir, "atlas")
            playbooks = project_dir / "repo" / "playbooks"
            before = sorted(p.name for p in playbooks.iterdir())
            inspect_atlas(
                ["list", "--json"],
                "dev/k8s",
                {"clusterctl_root": str(ctl)},
            )
            self.assertEqual(
                sorted(p.name for p in playbooks.iterdir()),
                before,
            )
            self.assertTrue((project_dir / "atlas").is_dir())
            self.assertTrue(playbooks.is_dir())

    def test_read_file_jails_to_inventory(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, leaf = self._ctl(tmp, "#!/bin/sh\necho '{}'\n")
            target = leaf / "hosts.yml"
            target.write_text("all: {}\n", encoding="utf-8")
            payload = read_atlas_file(
                "dev/k8s",
                "dev/k8s/hosts.yml",
                {"clusterctl_root": str(ctl)},
            )
            self.assertEqual(payload["content"], "all: {}\n")
            with self.assertRaises(InspectError):
                read_atlas_file(
                    "dev/k8s",
                    "../secret",
                    {"clusterctl_root": str(ctl)},
                )

    def test_read_log_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _leaf = self._ctl(tmp, "#!/bin/sh\necho '{}'\n")
            logs = ctl / "workspace" / "dev" / "k8s" / "logs"
            stamp_dir = logs / "20260101T000000"
            stamp_dir.mkdir(parents=True)
            (stamp_dir / "run.log").write_text("ok\n", encoding="utf-8")
            binary = ctl / "cluster"
            binary.write_text(
                "#!/bin/sh\n"
                f"echo '{json.dumps({'logs': str(logs)})}'\n",
                encoding="utf-8",
            )
            binary.chmod(0o755)
            text = read_atlas_log(
                "dev/k8s",
                "20260101T000000",
                {"clusterctl_root": str(ctl)},
            )
            self.assertEqual(text, "ok\n")
            with self.assertRaises(InspectError):
                read_atlas_log(
                    "dev/k8s",
                    "../etc",
                    {"clusterctl_root": str(ctl)},
                )

    def test_workspace_ls_and_read_jails(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _leaf = self._ctl(tmp, "#!/bin/sh\necho '{}'\n")
            cluster_ws = ctl / "workspace" / "dev" / "k8s"
            ansible = cluster_ws / ".ansible"
            ansible.mkdir(parents=True)
            (ansible / "ansible.cfg").write_text("inventory = hosts\n", encoding="utf-8")
            (cluster_ws / "logs").mkdir()
            (cluster_ws / "repos").mkdir()
            params = {"clusterctl_root": str(ctl)}
            listed = list_atlas_workspace("dev/k8s", "", params)
            names = {row["name"] for row in listed["entries"]}
            self.assertEqual(names, {".ansible", "logs", "repos"})
            nested = list_atlas_workspace("dev/k8s", ".ansible", params)
            self.assertEqual(nested["entries"][0]["rel"], ".ansible/ansible.cfg")
            payload = read_atlas_workspace_file(
                "dev/k8s", ".ansible/ansible.cfg", params
            )
            self.assertEqual(payload["content"], "inventory = hosts\n")
            self.assertFalse(payload.get("binary"))
            with self.assertRaises(InspectError):
                list_atlas_workspace("dev/k8s", "..", params)
            with self.assertRaises(InspectError):
                read_atlas_workspace_file("dev/k8s", "../secret", params)
            outside = tmp / "secret.txt"
            outside.write_text("nope\n", encoding="utf-8")
            (cluster_ws / "link.txt").symlink_to(outside)
            with self.assertRaises(InspectError):
                read_atlas_workspace_file("dev/k8s", "link.txt", params)

    def test_prepare_uses_project_workspace_root(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _leaf = self._ctl(tmp, "#!/bin/sh\necho ok\n")
            ws = tmp / "custom-ws"
            ws.mkdir()
            spec = prepare_atlas_run(
                {
                    "clusterctl_root": str(ctl),
                    "cluster_id": "dev/k8s",
                    "workspace_root": str(ws),
                }
            )
            self.assertEqual(spec["workspace_root"], ws.resolve())
            self.assertEqual(spec["env"]["ATLAS_WORKSPACE_ROOT"], str(ws.resolve()))

    def test_workspace_root_uses_clusterctl_config(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _leaf = self._ctl(tmp, "#!/bin/sh\necho '{}'\n")
            ws = tmp / "from-config"
            cluster_ws = ws / "dev" / "k8s"
            cluster_ws.mkdir(parents=True)
            (cluster_ws / "repos").mkdir()
            cfg = ctl / ".config"
            cfg.mkdir()
            (cfg / "config.yaml").write_text(
                "workspace:\n  path: " + str(ws) + "\n",
                encoding="utf-8",
            )
            listed = list_atlas_workspace(
                "dev/k8s", "", {"clusterctl_root": str(ctl)}
            )
            self.assertEqual(
                {row["name"] for row in listed["entries"]},
                {"repos"},
            )

    def test_clusters_root_uses_clusterctl_config(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, _decoy = self._ctl(tmp, "#!/bin/sh\necho '{}'\n")
            real = tmp / "from-yaml" / "clusters"
            leaf = real / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            cfg = ctl / ".config"
            cfg.mkdir()
            (cfg / "config.yaml").write_text(
                f"clusters:\n  path: {real}\n",
                encoding="utf-8",
            )
            payload = list_atlas_inventory_clusters({"clusterctl_root": str(ctl)})
            self.assertEqual(payload["clustersRoot"], str(real.resolve()))
            self.assertEqual(
                payload["clusters"],
                [{"id": "dev/k8s", "kind": "deployable"}],
            )


class InventoryClusterListTests(unittest.TestCase):
    def test_lists_hierarchical_leaves(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            for cid in ("dev/k8s", "prod/api"):
                leaf = root.joinpath(*cid.split("/"))
                leaf.mkdir(parents=True)
                (leaf / "cluster.yaml").write_text(f"id: {cid}\n", encoding="utf-8")
            (root / "_skip").mkdir()
            (root / "_skip" / "cluster.yaml").write_text("id: skip\n", encoding="utf-8")
            legacy = root / "standalone"
            legacy.mkdir()
            (legacy / "cluster.yaml").write_text("id: standalone\n", encoding="utf-8")
            self.assertEqual(
                list_inventory_cluster_ids(root),
                ["dev/k8s", "prod/api", "standalone"],
            )

    def test_empty_when_missing(self):
        self.assertEqual(list_inventory_cluster_ids(Path("/no/such/clusters")), [])

    def test_normalize_rejects_traversal(self):
        with self.assertRaises(InspectError):
            normalize_inventory_cluster_id("../etc")
        with self.assertRaises(InspectError):
            normalize_inventory_cluster_id("/abs/id")
        with self.assertRaises(InspectError):
            normalize_inventory_cluster_id("dev/k8s/extra")

    def test_resolve_requested_must_exist(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            leaf = root / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            params = {"clusters_root": str(root)}
            self.assertEqual(
                resolve_inspect_cluster_id(
                    requested="dev/k8s",
                    fallback="df/retr",
                    run_params=params,
                ),
                "dev/k8s",
            )
            with self.assertRaises(InspectError) as ctx:
                resolve_inspect_cluster_id(
                    requested="prod/missing",
                    fallback="df/retr",
                    run_params=params,
                )
            self.assertIn("unknown cluster_id", str(ctx.exception))
            self.assertEqual(
                resolve_inspect_cluster_id(
                    requested=None,
                    fallback="df/retr",
                    run_params=params,
                ),
                "df/retr",
            )

    def test_list_payload_kind(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            leaf = root / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            payload = list_atlas_inventory_clusters({"clusters_root": str(root)})
            self.assertEqual(payload["clustersRoot"], str(root.resolve()))
            self.assertEqual(
                payload["clusters"],
                [{"id": "dev/k8s", "kind": "deployable"}],
            )


if __name__ == "__main__":
    unittest.main()
