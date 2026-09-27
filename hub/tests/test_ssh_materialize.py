import json
import tempfile
import unittest
from pathlib import Path
import sys
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auth_env  # noqa: F401

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cryptography.hazmat.primitives import serialization  # noqa: E402

from atlas_operator_ssh import (  # noqa: E402
    AtlasOperatorSshError,
    materialize_operator_private_key,
)
from clusterctl_ssh import save_clusterctl_ssh_secret_id  # noqa: E402
from global_secrets_manager import GlobalSecretsManager  # noqa: E402
from project_secret_crypto import write_project_secret  # noqa: E402
from secret_encryption import get_encryption  # noqa: E402
import secret_encryption  # noqa: E402
from ssh_key_material import generate_ed25519_openssh  # noqa: E402


class MaterializePassphraseTests(unittest.TestCase):
    def setUp(self):
        secret_encryption._encryption_instance = None
        self._tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self._tmp.name)
        self.projects_dir = self.data_dir / "projects"
        self.projects_dir.mkdir()
        import executions_store

        self._patcher = mock.patch.object(
            executions_store, "PROJECTS_DIR", self.projects_dir
        )
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        self._tmp.cleanup()

    def _write_host_secret(self, project_id: str, payload: dict) -> None:
        ssh_dir = self.projects_dir / project_id / "secrets" / "ssh_keys"
        ssh_dir.mkdir(parents=True, exist_ok=True)
        write_project_secret(ssh_dir / "host.json", payload)

    def test_project_secret_writes_unencrypted_openssh(self):
        from playbooks_http import _materialize_ssh_key

        generated = generate_ed25519_openssh(passphrase="secret-pass")
        project_id = "p-mat"
        self._write_host_secret(
            project_id,
            {
                "type": "ssh_key",
                "name": "host",
                "privateKey": generated["privateKey"],
                "passphrase": "secret-pass",
            },
        )
        dest = self.projects_dir / project_id / "host.pem"
        path = _materialize_ssh_key(project_id, "host", dest)
        self.assertIsNotNone(path)
        pem = Path(path).read_bytes()
        serialization.load_ssh_private_key(pem, password=None)

    def test_wrong_passphrase_is_400(self):
        from playbooks_http import PlaybookHttpError, _materialize_ssh_key

        generated = generate_ed25519_openssh(passphrase="secret-pass")
        project_id = "p-mat-bad"
        self._write_host_secret(
            project_id,
            {
                "type": "ssh_key",
                "name": "host",
                "privateKey": generated["privateKey"],
                "passphrase": "wrong-pass",
            },
        )
        dest = self.projects_dir / project_id / "bad.pem"
        with self.assertRaises(PlaybookHttpError) as ctx:
            _materialize_ssh_key(project_id, "host", dest)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_operator_key_decrypts_passphrase(self):
        generated = generate_ed25519_openssh(passphrase="secret-pass")
        manager = GlobalSecretsManager(self.data_dir)
        created = manager.create_secret(
            "op-key",
            "git_ssh_key",
            {
                "privateKey": generated["privateKey"],
                "passphrase": "secret-pass",
            },
        )
        save_clusterctl_ssh_secret_id(self.data_dir, created["id"])
        dest = self.data_dir / "op.pem"
        path = materialize_operator_private_key(self.data_dir, dest)
        serialization.load_ssh_private_key(Path(path).read_bytes(), password=None)

    def test_operator_wrong_passphrase_raises(self):
        generated = generate_ed25519_openssh(passphrase="secret-pass")
        manager = GlobalSecretsManager(self.data_dir)
        created = manager.create_secret(
            "op-bad",
            "git_ssh_key",
            {
                "privateKey": generated["privateKey"],
                "passphrase": "secret-pass",
            },
        )
        path = manager._get_secret_file_path(created["id"])
        data = json.loads(path.read_text(encoding="utf-8"))
        data["passphrase"] = get_encryption().encrypt("wrong-pass")
        path.write_text(json.dumps(data), encoding="utf-8")
        save_clusterctl_ssh_secret_id(self.data_dir, created["id"])
        dest = self.data_dir / "op-bad.pem"
        with self.assertRaises(AtlasOperatorSshError) as ctx:
            materialize_operator_private_key(self.data_dir, dest)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertFalse(ctx.exception.silent)


if __name__ == "__main__":
    unittest.main()
