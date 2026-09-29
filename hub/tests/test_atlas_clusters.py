import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
from executions_store import get_project_executions_dir  # noqa: E402
from projects_store import load_projects, save_projects  # noqa: E402


class AtlasClustersHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["access_token"]

    def _inventory(self, tmp: Path) -> tuple[Path, Path]:
        ctl = tmp / "atlas-clusterctl"
        ctl.mkdir()
        binary = ctl / "cluster"
        binary.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\"\n"
            "echo '{\"ok\":true}'\n",
            encoding="utf-8",
        )
        binary.chmod(0o755)
        clusters = tmp / "inventory" / "clusters"
        for cid in ("dev/k8s", "prod/api"):
            leaf = clusters.joinpath(*cid.split("/"))
            leaf.mkdir(parents=True)
            (leaf / "cluster.yaml").write_text(
                f"id: {cid}\ndisplay_name: {cid}\n",
                encoding="utf-8",
            )
            (leaf / "hosts.yml").write_text(f"cluster: {cid}\n", encoding="utf-8")
        return ctl, clusters

    def _create_atlas(self, headers: dict, name: str, **extra):
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "atlas", **extra},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project = created.json()["project"]
        return project["id"], project

    def _list_ids(self, headers: dict, project_id: str) -> list[str]:
        listed = self.client.get(
            f"/api/projects/{project_id}/atlas/clusters",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        body = listed.json()
        self.assertTrue(body.get("success"))
        return [row["id"] for row in body.get("clusters") or []]

    def test_new_project_does_not_list_inventory(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            project_id, project = self._create_atlas(
                headers,
                "atlas-empty-clusters",
                clusterctlRoot=str(ctl),
            )
            self.assertEqual(project.get("clusterIds"), [])
            self.assertIsNone(project.get("cluster_id"))

            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(self._list_ids(headers, project_id), [])

    def test_create_cluster_id_seeds_membership_only(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            project_id, project = self._create_atlas(
                headers,
                "atlas-seeded-cluster",
                cluster_id="dev/k8s",
                clusterctlRoot=str(ctl),
            )
            self.assertEqual(project.get("clusterIds"), ["dev/k8s"])
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(self._list_ids(headers, project_id), ["dev/k8s"])

    def test_init_adds_owned_cluster_per_project(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            first_id, _ = self._create_atlas(
                headers, "atlas-owner-a", clusterctlRoot=str(ctl)
            )
            second_id, _ = self._create_atlas(
                headers, "atlas-owner-b", clusterctlRoot=str(ctl)
            )
            for pid in (first_id, second_id):
                updated = self.client.put(
                    f"/api/projects/{pid}",
                    json={"clustersRoot": str(clusters)},
                    headers=headers,
                )
                self.assertEqual(updated.status_code, 200, updated.text)

            queued = self.client.post(
                f"/api/projects/{first_id}/atlas/init",
                json={"argv": ["init", "prod/api", "--template", "k8s_full"]},
                headers=headers,
            )
            self.assertEqual(queued.status_code, 200, queued.text)
            self.assertEqual(self._list_ids(headers, first_id), ["prod/api"])
            self.assertEqual(self._list_ids(headers, second_id), [])

            fetched = self.client.get(
                f"/api/projects/{first_id}",
                headers=headers,
            )
            self.assertEqual(fetched.status_code, 200, fetched.text)
            self.assertEqual(
                fetched.json()["project"].get("clusterIds"), ["prod/api"]
            )

    def test_legacy_backfill_from_cluster_id_and_executions(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            project_id, _ = self._create_atlas(
                headers, "atlas-legacy-clusters", clusterctlRoot=str(ctl)
            )
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)

            projects = load_projects(gateway.PROJECTS_CONFIG_FILE)
            for project in projects:
                if project.get("id") == project_id:
                    project.pop("clusterIds", None)
                    project.pop("cluster_ids", None)
                    project["cluster_id"] = "dev/k8s"
            save_projects(gateway.PROJECTS_CONFIG_FILE, projects)

            exec_dir = get_project_executions_dir(project_id)
            exec_dir.mkdir(parents=True, exist_ok=True)
            (exec_dir / "run-1.json").write_text(
                json.dumps({"runParams": {"cluster_id": "prod/api"}}),
                encoding="utf-8",
            )

            self.assertEqual(
                self._list_ids(headers, project_id), ["dev/k8s", "prod/api"]
            )
            fetched = self.client.get(
                f"/api/projects/{project_id}",
                headers=headers,
            )
            self.assertEqual(
                fetched.json()["project"].get("clusterIds"),
                ["dev/k8s", "prod/api"],
            )

    def test_list_and_inspect_override_without_persisting(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            project_id, project = self._create_atlas(
                headers,
                "atlas-session-clusters",
                cluster_id="df/retr",
                clusterctlRoot=str(ctl),
            )
            self.assertEqual(project.get("cluster_id"), "df/retr")
            self.assertEqual(project.get("clusterIds"), ["df/retr"])

            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)

            self.assertEqual(self._list_ids(headers, project_id), ["df/retr"])

            inspect = self.client.post(
                f"/api/projects/{project_id}/atlas/inspect",
                json={"argv": ["plan", "--json"], "cluster_id": "prod/api"},
                headers=headers,
            )
            self.assertEqual(inspect.status_code, 200, inspect.text)
            inspect_body = inspect.json()
            self.assertTrue(inspect_body.get("success"))
            self.assertEqual(inspect_body.get("cluster_id"), "prod/api")
            self.assertIn("prod/api", inspect_body.get("argv") or [])

            unknown = self.client.post(
                f"/api/projects/{project_id}/atlas/inspect",
                json={"argv": ["plan", "--json"], "cluster_id": "../etc"},
                headers=headers,
            )
            self.assertEqual(unknown.status_code, 400, unknown.text)

            missing = self.client.post(
                f"/api/projects/{project_id}/atlas/inspect",
                json={"argv": ["plan", "--json"], "cluster_id": "qa/none"},
                headers=headers,
            )
            self.assertEqual(missing.status_code, 400, missing.text)
            self.assertIn("unknown cluster_id", missing.json().get("error", ""))

            file_res = self.client.get(
                f"/api/projects/{project_id}/atlas/file",
                params={"rel": "prod/api/hosts.yml", "cluster_id": "prod/api"},
                headers=headers,
            )
            self.assertEqual(file_res.status_code, 200, file_res.text)
            self.assertEqual(file_res.json().get("content"), "cluster: prod/api\n")

            listed_again = self._list_ids(headers, project_id)
            self.assertEqual(listed_again, ["df/retr"])

            fetched = self.client.get(
                f"/api/projects/{project_id}",
                headers=headers,
            )
            self.assertEqual(fetched.status_code, 200, fetched.text)
            again = fetched.json()["project"]
            self.assertEqual(again.get("cluster_id"), "df/retr")
            self.assertEqual(again.get("clusterIds"), ["df/retr"])

    def _rows(self, headers: dict, project_id: str) -> list[dict]:
        listed = self.client.get(
            f"/api/projects/{project_id}/atlas/clusters",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        body = listed.json()
        self.assertTrue(body.get("success"))
        return list(body.get("clusters") or [])

    def test_list_includes_leaf_metadata(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._inventory(tmp)
            workspace = tmp / "workspace" / "dev" / "k8s"
            workspace.mkdir(parents=True)
            project_id, _ = self._create_atlas(
                headers,
                "atlas-cluster-meta",
                cluster_id="dev/k8s",
                clusterctlRoot=str(ctl),
            )
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={
                    "clustersRoot": str(clusters),
                    "workspaceRoot": str(tmp / "workspace"),
                },
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            rows = self._rows(headers, project_id)
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(row.get("id"), "dev/k8s")
            self.assertEqual(row.get("env"), "dev")
            self.assertEqual(row.get("name"), "k8s")
            self.assertEqual(row.get("display_name"), "dev/k8s")
            self.assertTrue(row.get("leafExists"))
            self.assertTrue(row.get("workspaceExists"))
            self.assertFalse(row.get("archived"))
            self.assertEqual(row.get("kind"), "deployable")

    def test_list_includes_hosts_capacity(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._inventory(tmp)
            (clusters / "dev" / "k8s" / "hosts").write_text(
                "all:\n"
                "  children:\n"
                "    k8s_lbs:\n"
                "      hosts:\n"
                "        192.168.1.10:\n"
                "          hostname: lb1.example.com\n"
                "          provision:\n"
                "            sockets: 1\n"
                "            cores: 2\n"
                "            memory: 4096\n"
                "            disks:\n"
                "            - size: '70'\n"
                "    k8s_masters:\n"
                "      hosts:\n"
                "        192.168.1.20:\n"
                "          hostname: master1.example.com\n"
                "          provision:\n"
                "            sockets: 2\n"
                "            cores: 4\n"
                "            memory: 8192\n"
                "            disks:\n"
                "            - size: '100'\n"
                "            - size: '200'\n",
                encoding="utf-8",
            )
            project_id, _ = self._create_atlas(
                headers,
                f"atlas-cluster-capacity-{uuid.uuid4().hex[:8]}",
                cluster_id="dev/k8s",
                clusterctlRoot=str(ctl),
            )
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            row = self._rows(headers, project_id)[0]
            self.assertEqual(row.get("hostCount"), 2)
            self.assertEqual(row.get("cpu"), 10)
            self.assertEqual(row.get("memoryMb"), 12288)
            self.assertEqual(row.get("diskGb"), 370)

    def test_list_includes_created_and_run_stats(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._inventory(tmp)
            project_id, _ = self._create_atlas(
                headers,
                f"atlas-cluster-runs-{uuid.uuid4().hex[:8]}",
                cluster_id="dev/k8s",
                clusterctlRoot=str(ctl),
            )
            updated = self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            directory = get_project_executions_dir(project_id)
            directory.mkdir(parents=True, exist_ok=True)
            (directory / "ok.json").write_text(
                json.dumps(
                    {
                        "id": "ok",
                        "status": "SUCCESS",
                        "kind": "atlas",
                        "createdAt": 1700000100,
                        "finishedAt": 1700000200,
                        "runParams": {"cluster_id": "dev/k8s"},
                    }
                ),
                encoding="utf-8",
            )
            (directory / "bad.json").write_text(
                json.dumps(
                    {
                        "id": "bad",
                        "status": "FAILED",
                        "createdAt": 1700000300,
                        "finishedAt": 1700000400,
                        "runParams": {"clusterId": "dev/k8s"},
                    }
                ),
                encoding="utf-8",
            )
            (directory / "other.json").write_text(
                json.dumps(
                    {
                        "id": "other",
                        "status": "SUCCESS",
                        "finishedAt": 1700000500,
                        "runParams": {"cluster_id": "prod/api"},
                    }
                ),
                encoding="utf-8",
            )
            (directory / "untagged.json").write_text(
                json.dumps({"id": "untagged", "status": "SUCCESS", "finishedAt": 1700000600}),
                encoding="utf-8",
            )
            row = self._rows(headers, project_id)[0]
            self.assertEqual(row.get("runCount"), 2)
            self.assertEqual(row.get("successCount"), 1)
            self.assertEqual(row.get("lastRunAt"), 1700000400)
            created = row.get("createdAt")
            self.assertIsInstance(created, (int, float))
            cfg = clusters / "dev" / "k8s" / "cluster.yaml"
            cfg.write_text("id: dev/k8s\ndisplay_name: renamed\n", encoding="utf-8")
            os.utime(cfg, (created + 5000, created + 5000))
            again = self._rows(headers, project_id)[0]
            self.assertEqual(again.get("createdAt"), created)
            self.assertEqual(again.get("display_name"), "renamed")

    def test_archive_restore_and_unlink(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            project_id, _ = self._create_atlas(
                headers,
                "atlas-cluster-archive",
                cluster_id="dev/k8s",
                clusterctlRoot=str(ctl),
            )
            self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            archived = self.client.post(
                f"/api/projects/{project_id}/atlas/clusters/archive",
                json={"cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(archived.status_code, 200, archived.text)
            row = archived.json()["clusters"][0]
            self.assertTrue(row.get("archived"))
            self.assertEqual(self._list_ids(headers, project_id), ["dev/k8s"])
            restored = self.client.post(
                f"/api/projects/{project_id}/atlas/clusters/restore",
                json={"cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(restored.status_code, 200, restored.text)
            self.assertFalse(restored.json()["clusters"][0].get("archived"))
            leaf = clusters / "dev" / "k8s"
            self.assertTrue((leaf / "cluster.yaml").is_file())
            deleted = self.client.request(
                "DELETE",
                f"/api/projects/{project_id}/atlas/clusters",
                json={"cluster_id": "dev/k8s"},
                headers=headers,
            )
            self.assertEqual(deleted.status_code, 200, deleted.text)
            self.assertEqual(self._list_ids(headers, project_id), [])
            self.assertTrue((leaf / "cluster.yaml").is_file())

    def test_purge_removes_leaf_and_workspace(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            ctl, clusters = self._inventory(tmp)
            workspace = tmp / "workspace" / "prod" / "api"
            workspace.mkdir(parents=True)
            (workspace / "keep.txt").write_text("x\n", encoding="utf-8")
            project_id, _ = self._create_atlas(
                headers,
                "atlas-cluster-purge",
                cluster_id="prod/api",
                clusterctlRoot=str(ctl),
            )
            self.client.put(
                f"/api/projects/{project_id}",
                json={
                    "clustersRoot": str(clusters),
                    "workspaceRoot": str(tmp / "workspace"),
                },
                headers=headers,
            )
            leaf = clusters / "prod" / "api"
            deleted = self.client.request(
                "DELETE",
                f"/api/projects/{project_id}/atlas/clusters",
                json={"cluster_id": "prod/api", "purge": True},
                headers=headers,
            )
            self.assertEqual(deleted.status_code, 200, deleted.text)
            self.assertEqual(self._list_ids(headers, project_id), [])
            self.assertFalse(leaf.exists())
            self.assertFalse(workspace.exists())
            self.assertTrue((clusters / "dev" / "k8s" / "cluster.yaml").is_file())

    def test_patch_display_name(self):
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        with tempfile.TemporaryDirectory() as raw:
            ctl, clusters = self._inventory(Path(raw))
            project_id, _ = self._create_atlas(
                headers,
                "atlas-cluster-rename",
                cluster_id="dev/k8s",
                clusterctlRoot=str(ctl),
            )
            self.client.put(
                f"/api/projects/{project_id}",
                json={"clustersRoot": str(clusters)},
                headers=headers,
            )
            patched = self.client.patch(
                f"/api/projects/{project_id}/atlas/clusters",
                json={"cluster_id": "dev/k8s", "displayName": "Lab Kubernetes"},
                headers=headers,
            )
            self.assertEqual(patched.status_code, 200, patched.text)
            self.assertEqual(
                patched.json()["cluster"].get("display_name"),
                "Lab Kubernetes",
            )
            listed = self._rows(headers, project_id)
            self.assertEqual(listed[0].get("display_name"), "Lab Kubernetes")

    def test_archive_forbidden_without_execute(self):
        gateway.user_service.create_user(
            username="limited-clusters",
            password="limited1",
            email=None,
            roles=[],
        )
        access = self._login()
        headers = {"Authorization": f"Bearer {access}"}
        created = self.client.post(
            "/api/projects",
            json={"name": "atlas-cluster-denied", "kind": "atlas"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["id"]
        token = self.client.post(
            "/api/auth/login",
            json={"username": "limited-clusters", "password": "limited1"},
        ).json()["access_token"]
        denied = self.client.post(
            f"/api/projects/{project_id}/atlas/clusters/archive",
            json={"cluster_id": "dev/k8s"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertIn(
            "projects.update",
            denied.json().get("detail") or denied.json().get("error", ""),
        )


if __name__ == "__main__":
    unittest.main()
