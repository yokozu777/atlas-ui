import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from executions_create import create_execution_record  # noqa: E402
from executions_store import get_project_executions_dir  # noqa: E402


class CreateExecutionRecordTests(unittest.TestCase):
    def test_writes_queued_json(self):
        project_id = "p-create"
        execution_id = create_execution_record(
            {"playbookName": "ping", "status": "QUEUED"},
            project_id=project_id,
        )
        self.assertTrue(execution_id)
        path = get_project_executions_dir(project_id) / f"{execution_id}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "QUEUED")
        self.assertEqual(data["projectId"], project_id)
        self.assertIn("queuedAt", data)


if __name__ == "__main__":
    unittest.main()
