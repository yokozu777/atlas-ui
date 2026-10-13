#!/usr/bin/env python3
"""Tests for hub stuck-CANCELING recovery."""
from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from executions_recovery import recover_stuck_canceling  # noqa: E402
from executions_store import get_execution, get_project_executions_dir  # noqa: E402


class RecoverStuckCancelingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.project_id = f"p-recovery-{self.id().split('.')[-1]}"
        self.exec_dir = get_project_executions_dir(self.project_id)
        self.exec_dir.mkdir(parents=True, exist_ok=True)
        self.now = time.time()

    def _write(self, execution_id: str, **fields) -> dict:
        rec = {
            "id": execution_id,
            "projectId": self.project_id,
            "queuedAt": self.now - 600,
            "startedAt": self.now - 500,
            **fields,
        }
        path = self.exec_dir / f"{execution_id}.json"
        path.write_text(json.dumps(rec), encoding="utf-8")
        return rec

    def test_old_canceling_becomes_canceled_timeout(self) -> None:
        execution_id = "exec-old-cancel"
        self._write(
            execution_id,
            status="CANCELING",
            cancelRequestedAt=self.now - 600,
            statusUpdatedAt=self.now - 600,
        )
        recovered = recover_stuck_canceling(
            max_cancel_minutes=5,
            now=self.now,
        )
        self.assertGreaterEqual(recovered, 1)
        data = get_execution(execution_id, project_id=self.project_id)
        self.assertEqual(data["status"], "CANCELED")
        self.assertEqual(data["cancelReason"], "timeout")
        self.assertIn("finishedAt", data)
        self.assertIn("duration", data)

    def test_fresh_canceling_untouched(self) -> None:
        execution_id = "exec-fresh-cancel"
        self._write(
            execution_id,
            status="CANCELING",
            cancelRequestedAt=self.now - 30,
            statusUpdatedAt=self.now - 30,
        )
        recovered = recover_stuck_canceling(
            max_cancel_minutes=5,
            now=self.now,
        )
        self.assertEqual(recovered, 0)
        data = get_execution(execution_id, project_id=self.project_id)
        self.assertEqual(data["status"], "CANCELING")

    def test_status_updated_at_fallback(self) -> None:
        execution_id = "exec-fallback-anchor"
        self._write(
            execution_id,
            status="CANCELING",
            statusUpdatedAt=self.now - 600,
        )
        recovered = recover_stuck_canceling(
            max_cancel_minutes=5,
            now=self.now,
        )
        self.assertGreaterEqual(recovered, 1)
        data = get_execution(execution_id, project_id=self.project_id)
        self.assertEqual(data["status"], "CANCELED")
        self.assertEqual(data["cancelReason"], "timeout")

    def test_final_statuses_untouched(self) -> None:
        for status, execution_id in (
            ("SUCCESS", "exec-ok"),
            ("FAILED", "exec-fail"),
            ("CANCELED", "exec-done"),
            ("RUNNING", "exec-run"),
        ):
            self._write(
                execution_id,
                status=status,
                cancelRequestedAt=self.now - 600,
                statusUpdatedAt=self.now - 600,
            )
        recovered = recover_stuck_canceling(
            max_cancel_minutes=5,
            now=self.now,
        )
        self.assertEqual(recovered, 0)
        for status, execution_id in (
            ("SUCCESS", "exec-ok"),
            ("FAILED", "exec-fail"),
            ("CANCELED", "exec-done"),
            ("RUNNING", "exec-run"),
        ):
            data = get_execution(execution_id, project_id=self.project_id)
            self.assertEqual(data["status"], status)


if __name__ == "__main__":
    unittest.main()
