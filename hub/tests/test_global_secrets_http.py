import sys
from pathlib import Path as _AuthEnvPath
sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import tempfile
import unittest
from pathlib import Path
import sys

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402
import secret_encryption  # noqa: E402


class GlobalSecretsHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def setUp(self):
        secret_encryption._encryption_instance = None

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def test_options_not_captured_as_id(self):
        headers = self._login()
        res = self.client.get("/api/global/secrets/options", headers=headers)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json().get("success"))
        self.assertIn("options", res.json())

    def test_create_list_delete_and_key_status(self):
        headers = self._login()
        created = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": "git-main",
                "type": "git_token",
                "description": "ci",
                "token": "ghp_example_token_value",
                "metadata": {"username": "bot"},
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        secret = created.json()["secret"]
        self.assertNotIn("token", secret)
        secret_id = secret["id"]
        listed = self.client.get("/api/global/secrets", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        names = [row["name"] for row in listed.json().get("secrets") or []]
        self.assertIn("git-main", names)
        got = self.client.get(f"/api/global/secrets/{secret_id}", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        self.assertNotIn("token", got.json()["secret"])
        key = self.client.get("/api/global/secrets/encryption-key", headers=headers)
        self.assertEqual(key.status_code, 200, key.text)
        self.assertTrue(key.json()["key"]["exists"])
        self.assertIsNone(key.json()["key"]["masked"])
        replace = self.client.post(
            "/api/global/secrets/encryption-key",
            headers=headers,
            json={"key": "a" * 32},
        )
        self.assertEqual(replace.status_code, 400, replace.text)
        self.assertEqual(replace.json().get("errorCode"), "EXISTING_SECRETS")
        deleted = self.client.delete(f"/api/global/secrets/{secret_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        missing = self.client.get(f"/api/global/secrets/{secret_id}", headers=headers)
        self.assertEqual(missing.status_code, 404)

    def test_create_key_when_missing(self):
        headers = self._login()
        key_file = Path(_TMP.name) / "global" / "secrets" / ".encryption_key"
        if key_file.exists():
            key_file.unlink()
        secret_encryption._encryption_instance = None
        created = self.client.post(
            "/api/global/secrets/encryption-key/create",
            headers=headers,
        )
        self.assertIn(created.status_code, (200, 400), created.text)
        if created.status_code == 400:
            self.assertEqual(created.json().get("errorCode"), "KEY_EXISTS")
        else:
            self.assertTrue(created.json().get("success"))
        again = self.client.post(
            "/api/global/secrets/encryption-key/create",
            headers=headers,
        )
        self.assertEqual(again.status_code, 400, again.text)
        self.assertEqual(again.json().get("errorCode"), "KEY_EXISTS")

    def test_download_disabled(self):
        headers = self._login()
        res = self.client.get("/api/global/secrets/encryption-key/download", headers=headers)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json().get("errorCode"), "DISABLED")

    def test_options_purpose_git_filters_types(self):
        headers = self._login()
        git = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": "git-purpose-token",
                "type": "git_token",
                "token": "ghp_purpose_filter_token",
            },
        )
        self.assertEqual(git.status_code, 201, git.text)
        vault = self.client.post(
            "/api/global/secrets",
            headers=headers,
            json={
                "name": "vault-purpose-token",
                "type": "vault_token",
                "token": "s.vault_purpose_token",
            },
        )
        self.assertEqual(vault.status_code, 201, vault.text)
        res = self.client.get(
            "/api/global/secrets/options?purpose=git",
            headers=headers,
        )
        self.assertEqual(res.status_code, 200, res.text)
        options = res.json().get("options") or []
        self.assertTrue(options)
        types = {row.get("type") for row in options}
        names = {row.get("name") for row in options}
        self.assertIn("git_token", types)
        self.assertNotIn("vault_token", types)
        self.assertIn("git-purpose-token", names)
        self.assertNotIn("vault-purpose-token", names)
        for row in options:
            self.assertIn("id", row)
            self.assertTrue(row.get("id"))
            self.assertNotIn("token", row)
            self.assertNotIn("privateKey", row)
            self.assertNotIn("password", row)
        git_id = git.json()["secret"]["id"]
        vault_id = vault.json()["secret"]["id"]
        self.client.delete(f"/api/global/secrets/{git_id}", headers=headers)
        self.client.delete(f"/api/global/secrets/{vault_id}", headers=headers)


if __name__ == "__main__":
    unittest.main()
