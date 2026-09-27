import os
import tempfile
import time
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ssh_key_material import (  # noqa: E402
    SshKeyMaterialError,
    decrypt_openssh_private,
    generate_ed25519_openssh,
    validate_ssh_private_key,
)
from ssh_temp import (  # noqa: E402
    build_git_ssh_command,
    materialize_ssh_identity,
    sweep_stale_ssh_files,
    worker_ssh_key_scope,
    write_ssh_identity,
)


class SshKeyMaterialTests(unittest.TestCase):
    def test_decrypt_round_trip_with_passphrase(self):
        generated = generate_ed25519_openssh(passphrase="secret-pass")
        plain = decrypt_openssh_private(
            generated["privateKey"], passphrase="secret-pass"
        )
        self.assertIn("BEGIN OPENSSH PRIVATE KEY", plain)
        ok, err = validate_ssh_private_key(plain)
        self.assertTrue(ok, err)
        ok, _err = validate_ssh_private_key(
            generated["privateKey"], passphrase="secret-pass"
        )
        self.assertTrue(ok)

    def test_decrypt_without_passphrase_fails(self):
        generated = generate_ed25519_openssh(passphrase="secret-pass")
        with self.assertRaises(SshKeyMaterialError):
            decrypt_openssh_private(generated["privateKey"], passphrase="")
        ok, err = validate_ssh_private_key(generated["privateKey"])
        self.assertFalse(ok)
        self.assertIn("Invalid SSH private key", err or "")

    def test_begin_end_junk_is_invalid(self):
        junk = (
            "-----BEGIN OPENSSH PRIVATE KEY-----\n"
            "not-a-real-key\n"
            "-----END OPENSSH PRIVATE KEY-----\n"
        )
        ok, err = validate_ssh_private_key(junk)
        self.assertFalse(ok)
        self.assertTrue(err)


class SshTempTests(unittest.TestCase):
    def test_materialize_unlinks_and_uses_data_dir(self):
        generated = generate_ed25519_openssh(passphrase="pw")
        with tempfile.TemporaryDirectory() as raw:
            data_dir = Path(raw)
            with materialize_ssh_identity(
                generated["privateKey"], data_dir=data_dir, passphrase="pw"
            ) as path:
                self.assertTrue(path.is_file())
                self.assertTrue(
                    str(path).startswith(str(data_dir / "temp" / "ssh-keys" / "hub"))
                )
                cmd = build_git_ssh_command(path)
                self.assertIn("IdentitiesOnly=yes", cmd)
                self.assertIn("BatchMode=yes", cmd)
                self.assertIn(str(path), cmd)
            self.assertFalse(path.exists())

    def test_sweeper_removes_leftovers(self):
        generated = generate_ed25519_openssh()
        with tempfile.TemporaryDirectory() as raw:
            data_dir = Path(raw)
            leftover = write_ssh_identity(generated["privateKey"], data_dir=data_dir)
            pem = data_dir / "temp" / "ssh_key_deadbeef.pem"
            pem.parent.mkdir(parents=True, exist_ok=True)
            pem.write_text("secret", encoding="utf-8")
            self.assertTrue(leftover.is_file())
            sweep_stale_ssh_files(data_dir, scope="hub")
            self.assertFalse(leftover.exists())
            self.assertFalse(pem.exists())

    def test_sweep_hub_keeps_fresh_worker_key(self):
        generated = generate_ed25519_openssh()
        with tempfile.TemporaryDirectory() as raw:
            data_dir = Path(raw)
            hub_key = write_ssh_identity(
                generated["privateKey"], data_dir=data_dir, scope="hub"
            )
            worker_key = write_ssh_identity(
                generated["privateKey"], data_dir=data_dir, scope="worker-w1"
            )
            sweep_stale_ssh_files(data_dir, scope="hub")
            self.assertFalse(hub_key.exists())
            self.assertTrue(worker_key.is_file())

    def test_sweep_worker_removes_own_leftover(self):
        generated = generate_ed25519_openssh()
        with tempfile.TemporaryDirectory() as raw:
            data_dir = Path(raw)
            hub_key = write_ssh_identity(
                generated["privateKey"], data_dir=data_dir, scope="hub"
            )
            worker_key = write_ssh_identity(
                generated["privateKey"], data_dir=data_dir, scope="worker-w1"
            )
            sweep_stale_ssh_files(data_dir, scope="worker-w1")
            self.assertTrue(hub_key.is_file())
            self.assertFalse(worker_key.exists())
            self.assertEqual(worker_ssh_key_scope("w1"), "worker-w1")

    def test_sweep_foreign_ttl_removes_old_only(self):
        generated = generate_ed25519_openssh()
        with tempfile.TemporaryDirectory() as raw:
            data_dir = Path(raw)
            old_key = write_ssh_identity(
                generated["privateKey"], data_dir=data_dir, scope="worker-w1"
            )
            fresh_key = write_ssh_identity(
                generated["privateKey"], data_dir=data_dir, scope="worker-w2"
            )
            stale = time.time() - 25 * 3600
            os.utime(old_key, (stale, stale))
            sweep_stale_ssh_files(data_dir, scope="hub", max_age_s=86400)
            self.assertFalse(old_key.exists())
            self.assertTrue(fresh_key.is_file())


if __name__ == "__main__":
    unittest.main()
