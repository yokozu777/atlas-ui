import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auth_env  # noqa: F401

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import secret_encryption  # noqa: E402
from project_secret_crypto import (  # noqa: E402
    read_project_secret,
    write_project_secret,
)
from ssh_key_material import generate_ed25519_openssh  # noqa: E402


class ProjectSecretCryptoTests(unittest.TestCase):
    def setUp(self):
        secret_encryption._encryption_instance = None

    def test_write_hides_pem_and_password(self):
        generated = generate_ed25519_openssh()
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "k.json"
            write_project_secret(
                path,
                {
                    "type": "ssh_key",
                    "name": "k",
                    "privateKey": generated["privateKey"],
                    "passphrase": "hunter2-plain-leftover",
                    "password": "hunter2-plain-leftover",
                },
            )
            disk = path.read_text(encoding="utf-8")
            self.assertNotIn("BEGIN OPENSSH", disk)
            self.assertNotIn("hunter2-plain-leftover", disk)
            self.assertIn('"encryptedAtRest": true', disk)
            plain = read_project_secret(path)
            self.assertIn("BEGIN OPENSSH PRIVATE KEY", plain["privateKey"])
            self.assertEqual(plain["password"], "hunter2-plain-leftover")
            again = read_project_secret(path)
            self.assertEqual(again["privateKey"], plain["privateKey"])
            self.assertIn('"encryptedAtRest": true', path.read_text(encoding="utf-8"))

    def test_lazy_migrate_plaintext_leftover(self):
        generated = generate_ed25519_openssh()
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "k.json"
            path.write_text(
                json.dumps(
                    {
                        "type": "login_password",
                        "name": "login",
                        "privateKey": generated["privateKey"],
                        "password": "hunter2-plain-leftover",
                    }
                ),
                encoding="utf-8",
            )
            plain = read_project_secret(path)
            self.assertEqual(plain["password"], "hunter2-plain-leftover")
            self.assertIn("BEGIN OPENSSH PRIVATE KEY", plain["privateKey"])
            disk = path.read_text(encoding="utf-8")
            self.assertNotIn("BEGIN OPENSSH", disk)
            self.assertNotIn("hunter2-plain-leftover", disk)


if __name__ == "__main__":
    unittest.main()
