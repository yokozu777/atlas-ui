import json
import tempfile
import unittest
from pathlib import Path
import sys
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from json_file_lock import append_text_file, update_json_file  # noqa: E402
from projects_store import (  # noqa: E402
    load_projects,
    persist_atlas_cluster_membership,
    save_projects,
)


class JsonFileLockTests(unittest.TestCase):
    def test_sequential_updates_keep_fields(self):
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "doc.json"
            path.write_text(json.dumps({"keep": True}), encoding="utf-8")

            def add_one(data):
                data["one"] = 1

            def add_two(data):
                data["two"] = 2

            update_json_file(path, add_one)
            update_json_file(path, add_two)
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")),
                {"keep": True, "one": 1, "two": 2},
            )

    def test_append_text_file_joins_chunks(self):
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "a.log"
            append_text_file(path, "first")
            append_text_file(path, "second\n")
            self.assertEqual(path.read_text(encoding="utf-8"), "first\nsecond\n")


class ProjectsStoreLockTests(unittest.TestCase):
    def test_sequential_membership_keeps_name(self):
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "projects.json"
            save_projects(
                path,
                [{"id": "p1", "name": "lab", "kind": "atlas"}],
            )
            persist_atlas_cluster_membership(path, "p1", ["c1"], [])
            persist_atlas_cluster_membership(path, "p1", ["c1", "c2"], [])
            projects = load_projects(path)
            self.assertEqual(len(projects), 1)
            self.assertEqual(projects[0]["name"], "lab")
            self.assertEqual(projects[0]["clusterIds"], ["c1", "c2"])


class ExecutionRecordLockTests(unittest.TestCase):
    def test_second_update_sees_first_status(self):
        import executions_store
        from executions_store import update_execution_record

        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "projects"
            with mock.patch.object(executions_store, "PROJECTS_DIR", root):
                project_id = "p-lock"
                execution_id = "e-lock"
                dest = root / project_id / "history" / "executions"
                dest.mkdir(parents=True)
                (dest / f"{execution_id}.json").write_text(
                    json.dumps(
                        {
                            "id": execution_id,
                            "status": "QUEUED",
                            "projectId": project_id,
                        }
                    ),
                    encoding="utf-8",
                )
                self.assertTrue(
                    update_execution_record(
                        execution_id, {"status": "RUNNING"}, project_id=project_id
                    )
                )
                self.assertTrue(
                    update_execution_record(
                        execution_id, {"status": "SUCCESS"}, project_id=project_id
                    )
                )
                saved = json.loads(
                    (dest / f"{execution_id}.json").read_text(encoding="utf-8")
                )
                self.assertEqual(saved["status"], "SUCCESS")
                self.assertIn("startedAt", saved)
                self.assertIn("finishedAt", saved)


class WorkerRegistryLockTests(unittest.TestCase):
    def test_heartbeat_keeps_enabled_and_tags(self):
        from worker_registry import (
            create_worker,
            load_worker,
            update_worker,
            update_worker_heartbeat,
        )

        with tempfile.TemporaryDirectory() as raw:
            workers_dir = Path(raw) / "workers"
            workers_dir.mkdir()
            with mock.patch("worker_registry.WORKERS_DIR", workers_dir):
                worker_id, _token = create_worker("lock-w", tags=["lab"])
                self.assertTrue(update_worker(worker_id, tags=["lab", "keep"]))
                stored = load_worker(worker_id)
                stored["enabled"] = False
                from worker_registry import save_worker

                save_worker(stored)
                self.assertTrue(update_worker_heartbeat(worker_id, current_execution_id="e1"))
                after = load_worker(worker_id)
                self.assertFalse(after.get("enabled"))
                self.assertEqual(after.get("tags"), ["lab", "keep"])
                self.assertEqual(after.get("currentExecutionId"), "e1")
                self.assertTrue(after.get("lastSeenAt"))


if __name__ == "__main__":
    unittest.main()
