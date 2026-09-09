import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lab_secrets import (  # noqa: E402
    ensure_lab_secrets,
    resolve_encryption_key,
    resolve_jwt_secret,
)


class LabSecretsTests(unittest.TestCase):
    def test_resolve_requires_env_or_file(self):
        saved = {
            key: os.environ.get(key)
            for key in ("JWT_SECRET_KEY", "GLOBAL_SECRETS_ENCRYPTION_KEY")
        }
        try:
            os.environ.pop("JWT_SECRET_KEY", None)
            os.environ.pop("GLOBAL_SECRETS_ENCRYPTION_KEY", None)
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                with self.assertRaises(RuntimeError):
                    resolve_jwt_secret(root)
                with self.assertRaises(RuntimeError):
                    resolve_encryption_key(root)
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_ensure_writes_mode_600_and_exports(self):
        saved = {
            key: os.environ.get(key)
            for key in ("JWT_SECRET_KEY", "GLOBAL_SECRETS_ENCRYPTION_KEY")
        }
        try:
            os.environ.pop("JWT_SECRET_KEY", None)
            os.environ.pop("GLOBAL_SECRETS_ENCRYPTION_KEY", None)
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                ensure_lab_secrets(root)
                jwt_path = root / "auth" / "jwt_secret"
                enc_path = root / "auth" / "encryption_key"
                self.assertTrue(jwt_path.is_file())
                self.assertTrue(enc_path.is_file())
                self.assertEqual(stat.S_IMODE(jwt_path.stat().st_mode), 0o600)
                self.assertEqual(stat.S_IMODE(enc_path.stat().st_mode), 0o600)
                self.assertEqual(resolve_jwt_secret(root), jwt_path.read_text(encoding="utf-8").strip())
                self.assertEqual(
                    resolve_encryption_key(root),
                    enc_path.read_text(encoding="utf-8").strip(),
                )
                self.assertTrue(os.environ.get("JWT_SECRET_KEY"))
                self.assertTrue(os.environ.get("GLOBAL_SECRETS_ENCRYPTION_KEY"))
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


    def test_ensure_copies_legacy_encryption_key(self):
        saved = {
            key: os.environ.get(key)
            for key in ("JWT_SECRET_KEY", "GLOBAL_SECRETS_ENCRYPTION_KEY")
        }
        try:
            os.environ.pop("JWT_SECRET_KEY", None)
            os.environ.pop("GLOBAL_SECRETS_ENCRYPTION_KEY", None)
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                legacy = root / "global" / "secrets" / ".encryption_key"
                legacy.parent.mkdir(parents=True)
                legacy.write_text("legacy-encryption-key-value", encoding="utf-8")
                ensure_lab_secrets(root)
                self.assertEqual(
                    (root / "auth" / "encryption_key").read_text(encoding="utf-8").strip(),
                    "legacy-encryption-key-value",
                )
                self.assertEqual(
                    os.environ.get("GLOBAL_SECRETS_ENCRYPTION_KEY"),
                    "legacy-encryption-key-value",
                )
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
