import os
import tempfile
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from executions_create import create_execution_record  # noqa: E402
from executions_http import get_execution_log_tail  # noqa: E402
from executions_store import append_execution_log, read_log_chunk, update_execution_record  # noqa: E402


class ExecutionLogTailTests(unittest.TestCase):
    def test_returns_fail_line_from_tail(self):
        project_id = "p-log-tail"
        execution_id = create_execution_record(
            {"playbookName": "init", "status": "FAILED"},
            project_id=project_id,
        )
        append_execution_log(
            execution_id,
            "OK [cluster_config] config ok\nFAIL [execution_ssh_key] SSH key not found: /root/.ssh/id_rsa\n",
            project_id=project_id,
        )
        data = get_execution_log_tail(execution_id, project_id, tail=4096)
        self.assertIn("FAIL [execution_ssh_key]", data["text"])
        self.assertGreater(data["fileSize"], 0)

    def test_finished_log_stays_incomplete_until_eof(self):
        project_id = "p-log-chunk"
        execution_id = create_execution_record(
            {"playbookName": "addons", "status": "QUEUED"},
            project_id=project_id,
        )
        update_execution_record(execution_id, {"status": "RUNNING"}, project_id=project_id)
        update_execution_record(execution_id, {"status": "FAILED"}, project_id=project_id)
        append_execution_log(execution_id, "x" * (1024 * 1024 + 50) + "\nTAIL\n", project_id=project_id)
        text, next_offset, file_size, is_complete = read_log_chunk(
            execution_id,
            offset=0,
            limit=1024 * 1024,
            project_id=project_id,
        )
        self.assertGreater(file_size, 1024 * 1024)
        self.assertFalse(is_complete)
        self.assertLess(next_offset, file_size)
        self.assertNotIn("TAIL", text)
        rest, end, _, done = read_log_chunk(
            execution_id,
            offset=next_offset,
            limit=1024 * 1024,
            project_id=project_id,
        )
        self.assertIn("TAIL", rest)
        self.assertTrue(done)
        self.assertGreaterEqual(end, file_size)


if __name__ == "__main__":
    unittest.main()
