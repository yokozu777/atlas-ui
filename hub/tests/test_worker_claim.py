import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker_claim import check_execution_requirements, server_claim_next_execution


class ClaimRequirementsTests(unittest.TestCase):
    def test_tags_must_be_subset(self):
        execution = {"runParams": {"requirements": {"tags": ["docker"]}}}
        self.assertFalse(check_execution_requirements(execution, {}, ["local"]))
        self.assertTrue(check_execution_requirements(execution, {}, ["docker", "local"]))

    def test_no_requirements(self):
        self.assertTrue(check_execution_requirements({}, {}, []))


class ClaimRuntimeTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
