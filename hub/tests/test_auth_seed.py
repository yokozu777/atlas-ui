import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from auth_seed import align_bootstrap_admin, seed_default_user  # noqa: E402
from user_service import UserService  # noqa: E402


class AuthSeedTests(unittest.TestCase):
    def test_seeds_admin_admin_without_initial_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            with patch.dict(os.environ):
                os.environ.pop("ATLAS_ADMIN_PASSWORD", None)
                service = UserService(data)
                roles = MagicMock()
                roles.get_role_by_name.return_value = None
                created = seed_default_user(service, roles, data)
                self.assertTrue(created)
                self.assertFalse((data / "auth" / "admin-initial.txt").exists())
                user = service.get_user_by_username("admin")
                self.assertIsNotNone(user)
                self.assertTrue(user.must_change_password)
                self.assertIsNotNone(service.authenticate("admin", "admin"))

    def test_env_password_skips_must_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            with patch.dict(os.environ, {"ATLAS_ADMIN_PASSWORD": "admin123"}):
                service = UserService(data)
                roles = MagicMock()
                roles.get_role_by_name.return_value = None
                created = seed_default_user(service, roles, data)
                self.assertTrue(created)
                user = service.get_user_by_username("admin")
                self.assertFalse(user.must_change_password)
                self.assertIsNotNone(service.authenticate("admin", "admin123"))
                self.assertIsNone(service.authenticate("admin", "admin"))

    def test_align_does_not_reset_stale_bootstrap_password(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            auth = data / "auth"
            auth.mkdir()
            (auth / "admin-initial.txt").write_text("old-random-password\n", encoding="utf-8")
            with patch.dict(os.environ):
                os.environ.pop("ATLAS_ADMIN_PASSWORD", None)
                service = UserService(data)
                admin = service.create_user(
                    "admin",
                    "old-random-password",
                    must_change_password=True,
                )
                self.assertIsNone(service.authenticate("admin", "admin"))
                align_bootstrap_admin(service, data)
                self.assertFalse((auth / "admin-initial.txt").exists())
                self.assertIsNone(service.authenticate("admin", "admin"))
                self.assertIsNotNone(service.authenticate("admin", "old-random-password"))
                refreshed = service.get_user_by_username("admin")
                self.assertIsNotNone(refreshed)
                self.assertTrue(refreshed.must_change_password)
                self.assertEqual(refreshed.id, admin.id)

    def test_align_does_not_reset_changed_password(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            auth = data / "auth"
            auth.mkdir()
            (auth / "admin-initial.txt").write_text("leftover\n", encoding="utf-8")
            with patch.dict(os.environ):
                os.environ.pop("ATLAS_ADMIN_PASSWORD", None)
                service = UserService(data)
                service.create_user(
                    "admin",
                    "already-changed",
                    must_change_password=False,
                )
                align_bootstrap_admin(service, data)
                self.assertFalse((auth / "admin-initial.txt").exists())
                self.assertIsNotNone(service.authenticate("admin", "already-changed"))
                self.assertIsNone(service.authenticate("admin", "admin"))

    def test_align_skips_reset_when_env_password_set(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            with patch.dict(os.environ, {"ATLAS_ADMIN_PASSWORD": "from-env"}):
                service = UserService(data)
                service.create_user(
                    "admin",
                    "old-random-password",
                    must_change_password=True,
                )
                align_bootstrap_admin(service, data)
                self.assertIsNotNone(service.authenticate("admin", "old-random-password"))
                self.assertIsNone(service.authenticate("admin", "admin"))


if __name__ == "__main__":
    unittest.main()
