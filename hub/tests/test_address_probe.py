import unittest
from unittest.mock import patch

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from address_probe import AddressProbeError, probe_ipv4  # noqa: E402


class AddressProbeTests(unittest.TestCase):
    def test_rejects_non_address(self):
        with self.assertRaises(AddressProbeError):
            probe_ipv4("192.168.1.219;id")

    def test_no_reply_means_not_reachable(self):
        def fake_run(cmd, **_kwargs):
            self.assertEqual(cmd, ["ping", "-c", "1", "-W", "2", "192.168.1.219"])

            class Result:
                returncode = 1
                stderr = ""

            return Result()

        with patch("address_probe.subprocess.run", fake_run):
            result = probe_ipv4("192.168.1.219")
        self.assertTrue(result["checked"])
        self.assertFalse(result["reachable"])

    def test_reply_means_reachable(self):
        def fake_run(_cmd, **_kwargs):
            class Result:
                returncode = 0
                stderr = ""

            return Result()

        with patch("address_probe.subprocess.run", fake_run):
            result = probe_ipv4("10.0.0.8")
        self.assertTrue(result["reachable"])

    def test_permission_error_is_not_a_free_address(self):
        def fake_run(_cmd, **_kwargs):
            class Result:
                returncode = 2
                stderr = "ping: socket: Operation not permitted\n"

            return Result()

        with patch("address_probe.subprocess.run", fake_run):
            result = probe_ipv4("192.168.1.219")
        self.assertFalse(result["checked"])
        self.assertIsNone(result["reachable"])


if __name__ == "__main__":
    unittest.main()
