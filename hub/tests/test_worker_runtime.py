import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.system_info import detect_worker_runtime  # noqa: E402
from worker_registry import infer_worker_runtime  # noqa: E402


class InferWorkerRuntimeTests(unittest.TestCase):
    def test_never_seen_is_none(self):
        self.assertIsNone(infer_worker_runtime({"id": "w"}))
        self.assertIsNone(infer_worker_runtime(None))

    def test_explicit_runtime(self):
        self.assertEqual(
            infer_worker_runtime({"systemInfo": {"runtime": "docker", "hostname": "wm"}}),
            "docker",
        )
        self.assertEqual(
            infer_worker_runtime({"systemInfo": {"runtime": "local"}}),
            "local",
        )

    def test_linuxkit_and_docker_desktop(self):
        self.assertEqual(
            infer_worker_runtime(
                {
                    "systemInfo": {
                        "hostname": "docker-desktop",
                        "os": {"kernel": "#1 SMP PREEMPT_DYNAMIC linuxkit"},
                    }
                }
            ),
            "docker",
        )

    def test_host_system_info_is_local(self):
        self.assertEqual(
            infer_worker_runtime(
                {
                    "systemInfo": {
                        "hostname": "wm",
                        "os": {"kernel": "#31-generic", "version": "7.0.0"},
                    }
                }
            ),
            "local",
        )

    def test_stored_runtime_without_system_info(self):
        self.assertEqual(infer_worker_runtime({"runtime": "docker"}), "docker")


class DetectWorkerRuntimeTests(unittest.TestCase):
    def test_env_override(self):
        with patch.dict(os.environ, {"ATLAS_WORKER_RUNTIME": "docker"}):
            self.assertEqual(detect_worker_runtime(), "docker")
        with patch.dict(os.environ, {"ATLAS_WORKER_RUNTIME": "local"}):
            self.assertEqual(detect_worker_runtime(), "local")
