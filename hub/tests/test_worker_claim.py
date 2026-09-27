import json
import tempfile
import unittest
from pathlib import Path
import sys

from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker_claim import (
    check_execution_requirements,
    resolve_worker_max_concurrency,
    server_claim_next_execution,
)


class ClaimRequirementsTests(unittest.TestCase):
    def test_tags_must_be_subset(self):
        execution = {"runParams": {"requirements": {"tags": ["docker"]}}}
        self.assertFalse(check_execution_requirements(execution, {}, ["local"]))
        self.assertTrue(check_execution_requirements(execution, {}, ["docker", "local"]))

    def test_no_requirements(self):
        self.assertTrue(check_execution_requirements({}, {}, []))


class MaxConcurrencyResolveTests(unittest.TestCase):
    def test_defaults_to_one(self):
        self.assertEqual(resolve_worker_max_concurrency({}, env={}), 1)

    def test_clamps_to_cap(self):
        env = {"ATLAS_WORKER_MAX_CONCURRENCY_CAP": "8"}
        self.assertEqual(
            resolve_worker_max_concurrency({"maxConcurrency": 99}, env=env),
            8,
        )

    def test_ignores_junk(self):
        self.assertEqual(
            resolve_worker_max_concurrency({"maxConcurrency": "nope"}, env={}),
            1,
        )


class ClaimRuntimeTests(unittest.TestCase):
    def setUp(self):
        self._workers_tmp = tempfile.TemporaryDirectory()
        self._workers_dir = Path(self._workers_tmp.name)
        self._patcher = mock.patch("worker_registry.WORKERS_DIR", self._workers_dir)
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        self._workers_tmp.cleanup()

    def test_empty_queue(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            execution_id, data, project_id = server_claim_next_execution(
                "w1",
                {"name": "w", "tags": []},
                projects_dir=root,
            )
            self.assertIsNone(execution_id)
            self.assertIsNone(data)
            self.assertIsNone(project_id)

    def test_claims_queued_fifo(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            queued_dir = root / "p1" / "history" / "executions"
            queued_dir.mkdir(parents=True)
            first = {
                "id": "e1",
                "status": "QUEUED",
                "queuedAt": 1,
                "projectId": "p1",
            }
            second = {
                "id": "e2",
                "status": "QUEUED",
                "queuedAt": 2,
                "projectId": "p1",
            }
            (queued_dir / "e1.json").write_text(json.dumps(first), encoding="utf-8")
            (queued_dir / "e2.json").write_text(json.dumps(second), encoding="utf-8")
            execution_id, data, project_id = server_claim_next_execution(
                "w1",
                {"name": "local", "tags": []},
                projects_dir=root,
            )
            self.assertEqual(execution_id, "e1")
            self.assertEqual(project_id, "p1")
            self.assertEqual(data["status"], "RUNNING")
            self.assertEqual(data["workerId"], "w1")
            saved = json.loads((queued_dir / "e1.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["status"], "RUNNING")

    def _queue(self, root: Path, *ids: str):
        queued_dir = root / "p1" / "history" / "executions"
        queued_dir.mkdir(parents=True)
        for index, exec_id in enumerate(ids, start=1):
            payload = {
                "id": exec_id,
                "status": "QUEUED",
                "queuedAt": index,
                "projectId": "p1",
            }
            (queued_dir / f"{exec_id}.json").write_text(
                json.dumps(payload), encoding="utf-8"
            )
        return queued_dir

    def test_claim_body_max_concurrency_is_ignored(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            self._queue(root, "e1", "e2")
            worker = {"name": "w", "tags": [], "maxConcurrency": 1}
            first_id, _, _ = server_claim_next_execution(
                "w1",
                worker,
                max_concurrency=999,
                projects_dir=root,
            )
            self.assertEqual(first_id, "e1")
            second_id, _, _ = server_claim_next_execution(
                "w1",
                worker,
                max_concurrency=999,
                projects_dir=root,
            )
            self.assertIsNone(second_id)

    def test_stored_cap_allows_parallel(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            self._queue(root, "e1", "e2")
            worker = {"name": "w", "tags": [], "maxConcurrency": 2}
            first_id, _, _ = server_claim_next_execution(
                "w1", worker, projects_dir=root
            )
            second_id, _, _ = server_claim_next_execution(
                "w1", worker, projects_dir=root
            )
            self.assertEqual(first_id, "e1")
            self.assertEqual(second_id, "e2")

    def test_heartbeat_ignores_max_concurrency(self):
        from unittest import mock

        from worker_registry import (
            create_worker,
            load_worker,
            save_worker,
            update_worker,
            update_worker_heartbeat,
        )

        with tempfile.TemporaryDirectory() as raw:
            workers_dir = Path(raw) / "workers"
            workers_dir.mkdir()
            root = Path(raw)
            self._queue(root, "e1", "e2")
            with mock.patch("worker_registry.WORKERS_DIR", workers_dir):
                worker_id, _token = create_worker("cap-w")
                stored = load_worker(worker_id)
                stored["maxConcurrency"] = 1
                save_worker(stored)
                self.assertTrue(
                    update_worker_heartbeat(worker_id, max_concurrency=999)
                )
                self.assertEqual(load_worker(worker_id).get("maxConcurrency"), 1)

                self.assertTrue(update_worker(worker_id, max_concurrency=2))
                worker = load_worker(worker_id)
                self.assertEqual(worker.get("maxConcurrency"), 2)
                first_id, _, _ = server_claim_next_execution(
                    worker_id,
                    worker,
                    max_concurrency=999,
                    projects_dir=root,
                )
                second_id, _, _ = server_claim_next_execution(
                    worker_id,
                    worker,
                    max_concurrency=999,
                    projects_dir=root,
                )
                self.assertEqual(first_id, "e1")
                self.assertEqual(second_id, "e2")


if __name__ == "__main__":
    unittest.main()
