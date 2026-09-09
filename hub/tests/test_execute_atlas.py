import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from worker.execute_atlas import (
    ENV_FORCE_LOCAL,
    argv_executor,
    build_atlas_argv,
    clusterctl_root_from_params,
    docker_executor_container_name,
    execute_atlas_run,
    inventory_leaf_path,
    merge_atlas_git_env,
    prepare_atlas_run,
    require_inventory_leaf,
    resolve_clusters_root,
    resolve_workspace_root,
)


class _FakeHttp:
    def __init__(self, status=None):
        self.logs = []
        self.finished = None
        self.status = status

    def send_log(self, execution_id, msg):
        self.logs.append(msg)

    def finish_execution(self, execution_id, **kwargs):
        self.finished = kwargs

    def heartbeat(self, current_execution_id=None):
        pass

    def get_execution_status(self, execution_id, project_id=None):
        return self.status


class ExecuteAtlasArgvTests(unittest.TestCase):
    def test_injects_cluster_flag(self):
        argv = build_atlas_argv({"cluster_id": "dev/k8s", "argv": ["run", "--dry-run"]})
        self.assertEqual(argv[:3], ["--cluster", "dev/k8s", "run"])
        self.assertIn("--dry-run", argv)

    def test_does_not_duplicate_cluster(self):
        argv = build_atlas_argv(
            {"cluster_id": "dev/k8s", "argv": ["--cluster", "dev/k8s", "run"]}
        )
        self.assertEqual(argv.count("--cluster"), 1)

    def test_argv_executor(self):
        self.assertEqual(argv_executor(["run", "--executor", "docker"]), "docker")
        self.assertEqual(argv_executor(["run", "--executor=local"]), "local")
        self.assertIsNone(argv_executor(["run"]))


class ExecuteAtlasInventoryTests(unittest.TestCase):
    def setUp(self):
        self._saved = {
            key: os.environ.get(key)
            for key in (
                "ATLAS_CLUSTER_ROOT",
                "ATLAS_CLUSTERS_ROOT",
                "ATLAS_WORKSPACE_ROOT",
                ENV_FORCE_LOCAL,
            )
        }
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        os.environ.pop("ATLAS_CLUSTERS_ROOT", None)
        os.environ.pop("ATLAS_WORKSPACE_ROOT", None)
        os.environ.pop(ENV_FORCE_LOCAL, None)

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_empty_cluster_root_message(self):
        with self.assertRaises(ValueError) as ctx:
            clusterctl_root_from_params({})
        self.assertIn("ATLAS_CLUSTER_ROOT", str(ctx.exception))

    def test_empty_root_is_logged_on_execution(self):
        http = _FakeHttp()
        out = execute_atlas_run("e1", {"runParams": {}}, "p1", http)
        self.assertEqual(out["status"], "FAILED")
        self.assertTrue(any("ATLAS_CLUSTER_ROOT" in line for line in http.logs))
        self.assertEqual(http.finished["status"], "FAILED")

    def test_resolve_clusters_root_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            inv = Path(tmp) / "inv"
            inv.mkdir()
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            os.environ["ATLAS_CLUSTERS_ROOT"] = str(inv)
            self.assertEqual(resolve_clusters_root(ctl, {}), inv.resolve())

    def test_sibling_inventory(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            ctl = base / "atlas-clusterctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            leaf = base / "atlas-inventory" / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            spec = prepare_atlas_run(
                {"clusterctl_root": str(ctl), "cluster_id": "dev/k8s"}
            )
            self.assertEqual(spec["leaf"], leaf.resolve())
            self.assertEqual(spec["env"]["ATLAS_CLUSTERS_ROOT"], str(leaf.parent.parent.resolve()))

    def test_missing_leaf(self):
        with tempfile.TemporaryDirectory() as tmp:
            clusters = Path(tmp) / "clusters"
            clusters.mkdir()
            with self.assertRaises(ValueError) as ctx:
                require_inventory_leaf(clusters, "dev/k8s")
            self.assertIn("dev/k8s", str(ctx.exception))
            self.assertEqual(
                inventory_leaf_path(clusters, "dev/k8s"),
                clusters / "dev" / "k8s",
            )

    def test_run_params_clusters_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            other = Path(tmp) / "other"
            other.mkdir()
            found = resolve_clusters_root(ctl, {"clusters_root": str(other)})
            self.assertEqual(found, other.resolve())

    def test_run_params_workspace_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            leaf = Path(tmp) / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            ws = Path(tmp) / "runtime-ws"
            ws.mkdir()
            spec = prepare_atlas_run(
                {
                    "clusterctl_root": str(ctl),
                    "cluster_id": "dev/k8s",
                    "clusters_root": str(leaf.parent.parent),
                    "workspace_root": str(ws),
                }
            )
            self.assertEqual(spec["workspace_root"], ws.resolve())
            self.assertEqual(spec["env"]["ATLAS_WORKSPACE_ROOT"], str(ws.resolve()))
            self.assertEqual(resolve_workspace_root(ctl, {"workspaceRoot": str(ws)}), ws.resolve())
            self.assertNotIn(ENV_FORCE_LOCAL, spec["env"])

    def test_merges_whitelisted_git_env_not_ssh_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            leaf = Path(tmp) / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            spec = prepare_atlas_run(
                {
                    "clusterctl_root": str(ctl),
                    "cluster_id": "dev/k8s",
                    "clusters_root": str(leaf.parent.parent),
                    "env": {
                        "GIT_SSH_COMMAND": "ssh -i /tmp/git-ssh/default",
                        "PLAYBOOKS_ATLAS_K8S_CORE_SSH_KEY": "/tmp/git-ssh/core",
                        "SSH_KEY": "/should/not/apply",
                        "PATH": "/evil",
                    },
                }
            )
            self.assertEqual(spec["env"]["GIT_SSH_COMMAND"], "ssh -i /tmp/git-ssh/default")
            self.assertEqual(
                spec["env"]["PLAYBOOKS_ATLAS_K8S_CORE_SSH_KEY"],
                "/tmp/git-ssh/core",
            )
            self.assertNotEqual(spec["env"].get("SSH_KEY"), "/should/not/apply")
            self.assertNotEqual(spec["env"].get("PATH"), "/evil")

    def test_merge_atlas_git_env_helper(self):
        env = {"SSH_KEY": "/host/key"}
        merge_atlas_git_env(
            env,
            {"GIT_SSH_COMMAND": "ssh -i /a", "FOO": "bar", "SSH_KEY": "/nope"},
        )
        self.assertEqual(env["GIT_SSH_COMMAND"], "ssh -i /a")
        self.assertEqual(env["SSH_KEY"], "/host/key")
        self.assertNotIn("FOO", env)

    def test_config_yaml_paths_without_project_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            ctl = base / "atlas-clusterctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            decoy = base / "atlas-inventory" / "clusters" / "dev" / "k8s"
            decoy.mkdir(parents=True)
            (decoy / "cluster.yaml").write_text("id: decoy\n", encoding="utf-8")
            clusters = base / "from-yaml" / "clusters"
            leaf = clusters / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            ws = base / "from-yaml" / "workspace"
            ws.mkdir()
            cfg = ctl / ".config"
            cfg.mkdir()
            (cfg / "config.yaml").write_text(
                f"clusters:\n  path: {clusters}\nworkspace:\n  path: {ws}\n",
                encoding="utf-8",
            )
            spec = prepare_atlas_run(
                {"clusterctl_root": str(ctl), "cluster_id": "dev/k8s"}
            )
            self.assertEqual(spec["clusters_root"], clusters.resolve())
            self.assertEqual(spec["workspace_root"], ws.resolve())
            self.assertEqual(spec["leaf"], leaf.resolve())

    def test_explicit_workspace_beats_yaml(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            ctl = base / "ctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            leaf = base / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            yaml_ws = base / "yaml-ws"
            yaml_ws.mkdir()
            explicit_ws = base / "explicit-ws"
            explicit_ws.mkdir()
            cfg = ctl / ".config"
            cfg.mkdir()
            (cfg / "config.yaml").write_text(
                f"workspace:\n  path: {yaml_ws}\n",
                encoding="utf-8",
            )
            spec = prepare_atlas_run(
                {
                    "clusterctl_root": str(ctl),
                    "cluster_id": "dev/k8s",
                    "clusters_root": str(leaf.parent.parent),
                    "workspace_root": str(explicit_ws),
                }
            )
            self.assertEqual(spec["workspace_root"], explicit_ws.resolve())

    def test_docker_mode_requires_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            leaf = Path(tmp) / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text(
                "id: dev/k8s\nexecution:\n  mode: docker\n  image: x/y\n  tag: '1'\n",
                encoding="utf-8",
            )
            with patch("worker.execute_atlas.shutil.which", return_value=None):
                with self.assertRaises(ValueError) as ctx:
                    prepare_atlas_run(
                        {
                            "clusterctl_root": str(ctl),
                            "cluster_id": "dev/k8s",
                            "clusters_root": str(leaf.parent.parent),
                        }
                    )
            self.assertIn("docker CLI", str(ctx.exception))

    def test_executor_local_skips_docker_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            (ctl / "cluster").write_text("#!/bin/sh\n", encoding="utf-8")
            (ctl / "cluster").chmod(0o755)
            leaf = Path(tmp) / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text(
                "id: dev/k8s\nexecution:\n  mode: docker\n  image: x/y\n  tag: '1'\n",
                encoding="utf-8",
            )
            with patch("worker.execute_atlas.shutil.which", return_value=None):
                spec = prepare_atlas_run(
                    {
                        "clusterctl_root": str(ctl),
                        "cluster_id": "dev/k8s",
                        "clusters_root": str(leaf.parent.parent),
                        "argv": ["--cluster", "dev/k8s", "run", "--executor", "local"],
                    }
                )
            self.assertEqual(spec["executor_mode"], "local")


class DockerExecutorNameTests(unittest.TestCase):
    def test_container_name(self):
        self.assertEqual(
            docker_executor_container_name("198fbeab-43e8-4707-bf47-396fcfcb0caa"),
            "atlas-exec-198fbeab-43e8-4707-bf47-396fcfcb0caa",
        )


class ExecuteAtlasCancelTests(unittest.TestCase):
    def test_canceling_stops_child_and_finishes_canceled(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctl = Path(tmp) / "ctl"
            ctl.mkdir()
            (ctl / "cluster").write_text(
                "#!/bin/sh\ntrap 'exit 143' TERM\nsleep 30\n",
                encoding="utf-8",
            )
            (ctl / "cluster").chmod(0o755)
            leaf = Path(tmp) / "clusters" / "dev" / "k8s"
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text("id: dev/k8s\n", encoding="utf-8")
            http = _FakeHttp(status="CANCELING")
            with patch("worker.execute_atlas.shutil.which", return_value=None):
                out = execute_atlas_run(
                    "e-cancel",
                    {
                        "runParams": {
                            "clusterctl_root": str(ctl),
                            "cluster_id": "dev/k8s",
                            "clusters_root": str(leaf.parent.parent),
                            "argv": ["--cluster", "dev/k8s", "run"],
                        }
                    },
                    "p1",
                    http,
                    heartbeat_interval=60,
                    grace_period=1,
                )
            self.assertEqual(out["status"], "CANCELED")
            self.assertEqual(http.finished["status"], "CANCELED")
            self.assertTrue(
                any("Stop requested" in line for line in http.logs),
                http.logs,
            )


if __name__ == "__main__":
    unittest.main()
