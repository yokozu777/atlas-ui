import os
import tempfile
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server_logs_http import list_server_logs  # noqa: E402


class ServerLogsTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(_TMP.name)
        self.logs = self.root / "logs"
        self.logs.mkdir(parents=True, exist_ok=True)
        (self.logs / "hub.log").write_text(
            "[2026-08-31 10:00:00] INFO: hub started\n"
            "[2026-08-31 10:01:00] ERROR: boom token=supersecret\n"
            "[2026-08-31 10:02:00] DEBUG: quiet\n",
            encoding="utf-8",
        )
        (self.logs / "worker.log").write_text(
            "[2026-08-31 10:00:30] WARNING: worker slow\n",
            encoding="utf-8",
        )

    def test_all_services_and_redact(self):
        out = list_server_logs(self.root, service="all")
        self.assertTrue(out["success"])
        self.assertEqual(out["total"], 4)
        self.assertEqual(out["stats"]["error"], 1)
        messages = [row["message"] for row in out["logs"]]
        self.assertTrue(any("***REDACTED***" in msg for msg in messages))
        self.assertFalse(any("supersecret" in msg for msg in messages))
        raws = [row["raw"] for row in out["logs"]]
        self.assertTrue(any("[2026-08-31 10:01:00]" in line for line in raws))
        self.assertFalse(any("supersecret" in line for line in raws))

    def test_filter_level_and_search(self):
        errors = list_server_logs(self.root, level="error")
        self.assertEqual(errors["total"], 1)
        self.assertEqual(errors["logs"][0]["level"], "ERROR")
        search = list_server_logs(self.root, search="worker")
        self.assertEqual(search["total"], 1)
        self.assertEqual(search["logs"][0]["service"], "worker")

    def test_backend_alias_and_service_filter(self):
        hub = list_server_logs(self.root, service="backend")
        self.assertTrue(all(row["service"] == "hub" for row in hub["logs"]))
        self.assertGreaterEqual(hub["total"], 1)
        worker = list_server_logs(self.root, service="worker")
        self.assertEqual(worker["total"], 1)


if __name__ == "__main__":
    unittest.main()
