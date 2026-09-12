import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clusterctl_config import (  # noqa: E402
    apply_project_path_fields,
    clusterctl_root_from_project,
    clusterctl_root_from_ui_config,
    inspect_run_params_from_project,
    load_path_defaults,
    resolve_clusters_root,
    resolve_configured_path,
    resolve_workspace_root,
    save_clusterctl_root_to_ui_config,
)


class ClusterctlConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self._saved = {
            key: os.environ.get(key)
            for key in (
                "ATLAS_CLUSTER_ROOT",
                "ATLAS_CLUSTERCTL_CONFIG",
                "ATLAS_CLUSTERS_ROOT",
                "ATLAS_WORKSPACE_ROOT",
                "ATLAS_UI_CONFIG",
            )
        }
        os.environ.pop("ATLAS_CLUSTERCTL_CONFIG", None)
        os.environ.pop("ATLAS_CLUSTERS_ROOT", None)
        os.environ.pop("ATLAS_WORKSPACE_ROOT", None)
        os.environ.pop("ATLAS_UI_CONFIG", None)

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def test_missing_config_file(self):
        out = load_path_defaults(self.root)
        self.assertFalse(out["configExists"])
        self.assertEqual(out["clustersRoot"], "")
        self.assertEqual(out["workspaceRoot"], "")
        self.assertTrue(out["configPath"].endswith(".config/config.yaml"))

    def test_none_root(self):
        out = load_path_defaults(None)
        self.assertFalse(out["configExists"])
        self.assertEqual(out["configPath"], "")

    def test_reads_yaml_absolute_and_relative(self):
        cfg_dir = self.root / ".config"
        cfg_dir.mkdir()
        (cfg_dir / "config.yaml").write_text(
            "clusters:\n  path: /opt/inventory/clusters\n"
            "workspace:\n  path: ../ws\n",
            encoding="utf-8",
        )
        out = load_path_defaults(self.root)
        self.assertTrue(out["configExists"])
        self.assertEqual(out["clustersRoot"], "/opt/inventory/clusters")
        self.assertEqual(
            Path(out["workspaceRoot"]),
            (self.root / "../ws").resolve(),
        )

    def test_resolve_relative_against_repo_root(self):
        self.assertEqual(
            resolve_configured_path("clusters", repo_root=self.root),
            (self.root / "clusters").resolve(),
        )

    def test_apply_and_clear_path_fields(self):
        project: dict = {"id": "p1"}
        apply_project_path_fields(
            project,
            {"clustersRoot": " /tmp/c ", "workspace": {"path": "/tmp/w"}},
        )
        self.assertEqual(project["clustersRoot"], "/tmp/c")
        self.assertEqual(project["workspaceRoot"], "/tmp/w")
        apply_project_path_fields(project, {"clustersRoot": "", "workspaceRoot": "  "})
        self.assertNotIn("clustersRoot", project)
        self.assertNotIn("workspaceRoot", project)

    def test_inspect_params(self):
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        params = inspect_run_params_from_project(
            {
                "clusterctlRoot": "/ctl",
                "clustersRoot": "/clusters",
                "workspaceRoot": "/ws",
            }
        )
        self.assertEqual(
            params,
            {
                "clusterctl_root": "/ctl",
                "clusters_root": "/clusters",
                "workspace_root": "/ws",
            },
        )

    def test_clusterctl_root_from_ui_config(self):
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        cfg = self.root / "ui-config.json"
        cfg.write_text(
            '{"clusterctlRoot": "/home/homer/git/atlas-clusterctl"}\n',
            encoding="utf-8",
        )
        os.environ["ATLAS_UI_CONFIG"] = str(cfg)
        self.assertEqual(
            clusterctl_root_from_project({}),
            Path("/home/homer/git/atlas-clusterctl"),
        )
        self.assertEqual(
            inspect_run_params_from_project({})["clusterctl_root"],
            "/home/homer/git/atlas-clusterctl",
        )

    def test_project_clusterctl_root_beats_ui_config(self):
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        cfg = self.root / "ui-config.json"
        cfg.write_text('{"clusterctlRoot": "/from-ui"}\n', encoding="utf-8")
        os.environ["ATLAS_UI_CONFIG"] = str(cfg)
        self.assertEqual(
            clusterctl_root_from_project({"clusterctlRoot": "/from-project"}),
            Path("/from-project"),
        )

    def test_save_clusterctl_root_merges_ui_config(self):
        cfg = self.root / "ui-config.json"
        cfg.write_text('{"other": 1, "clusterctlRoot": "/old"}\n', encoding="utf-8")
        os.environ["ATLAS_UI_CONFIG"] = str(cfg)
        dest = self.root / "atlas-clusterctl"
        dest.mkdir()
        save_clusterctl_root_to_ui_config(dest)
        self.assertEqual(clusterctl_root_from_ui_config(), dest.resolve())
        self.assertEqual(
            json.loads(cfg.read_text(encoding="utf-8"))["other"],
            1,
        )

    def test_env_beats_ui_config(self):
        os.environ["ATLAS_CLUSTER_ROOT"] = "/from-env"
        cfg = self.root / "ui-config.json"
        cfg.write_text('{"clusterctlRoot": "/from-ui"}\n', encoding="utf-8")
        os.environ["ATLAS_UI_CONFIG"] = str(cfg)
        self.assertEqual(clusterctl_root_from_project({}), Path("/from-env"))

    def test_resolve_prefers_yaml_over_sibling(self):
        ctl = self.root / "atlas-clusterctl"
        ctl.mkdir()
        decoy = self.root / "atlas-inventory" / "clusters"
        decoy.mkdir(parents=True)
        real = self.root / "inventory" / "clusters"
        ws = self.root / "runtime-ws"
        real.mkdir(parents=True)
        ws.mkdir()
        cfg = ctl / ".config"
        cfg.mkdir()
        (cfg / "config.yaml").write_text(
            f"clusters:\n  path: {real}\nworkspace:\n  path: {ws}\n",
            encoding="utf-8",
        )
        self.assertEqual(resolve_clusters_root(ctl, {}), real.resolve())
        self.assertEqual(resolve_workspace_root(ctl, {}), ws.resolve())

    def test_resolve_explicit_beats_yaml(self):
        ctl = self.root / "atlas-clusterctl"
        ctl.mkdir()
        cfg = ctl / ".config"
        cfg.mkdir()
        (cfg / "config.yaml").write_text(
            "clusters:\n  path: /from-yaml/clusters\n"
            "workspace:\n  path: /from-yaml/workspace\n",
            encoding="utf-8",
        )
        other_c = self.root / "other-c"
        other_w = self.root / "other-w"
        other_c.mkdir()
        other_w.mkdir()
        self.assertEqual(
            resolve_clusters_root(ctl, {"clusters_root": str(other_c)}),
            other_c.resolve(),
        )
        self.assertEqual(
            resolve_workspace_root(ctl, {"workspaceRoot": str(other_w)}),
            other_w.resolve(),
        )


if __name__ == "__main__":
    unittest.main()
