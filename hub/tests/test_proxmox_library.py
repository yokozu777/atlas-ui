import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("GLOBAL_SECRETS_ENCRYPTION_KEY", "test-encryption-key-not-for-production")

from proxmox_hypervisors import (  # noqa: E402
    clear_catalog_cache,
    create_api_token,
    create_hypervisor,
    list_hypervisors,
    match_hypervisor,
    run_library,
    update_hypervisor,
    vmid_status,
)
from proxmox_library_git import install_library, inspect_checkout  # noqa: E402


def _git(repo: Path, *args: str) -> None:
    subprocess.check_call(
        [
            "git",
            "-c",
            "user.email=test@example.com",
            "-c",
            "user.name=test",
            *args,
        ],
        cwd=repo,
        stdout=subprocess.DEVNULL,
    )


class HypervisorStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        clear_catalog_cache()

    def tearDown(self):
        self.tmp.cleanup()

    def test_password_is_encrypted_at_rest(self):
        created = create_hypervisor(
            self.data,
            {
                "name": "lab",
                "host": "192.168.1.20",
                "apiUser": "root@pam",
                "sshUser": "root",
                "password": "secret-pass",
            },
        )
        public = created["hypervisor"]
        self.assertNotIn("password", public)
        self.assertTrue(public["hasPassword"])
        raw = (self.data / "hypervisors.json").read_text(encoding="utf-8")
        self.assertNotIn("secret-pass", raw)
        listed = list_hypervisors(self.data)["hypervisors"]
        self.assertEqual(listed[0]["host"], "192.168.1.20")
        matched = match_hypervisor(self.data, "192.168.1.20")
        self.assertIsNotNone(matched)
        self.assertNotEqual(matched["password"], "secret-pass")
        update_hypervisor(self.data, public["id"], {"name": "lab2"})
        again = match_hypervisor(self.data, "LAB2")
        self.assertEqual(again["id"], public["id"])

    def test_run_library_keeps_password_out_of_argv(self):
        captured = {}

        def fake_run(cmd, **kwargs):
            captured["cmd"] = cmd
            captured["env"] = kwargs.get("env") or {}

            class Result:
                returncode = 0
                stdout = '{"ok": true, "nodes": ["pve"]}\n'
                stderr = ""

            return Result()

        with patch("proxmox_hypervisors.library_checkout", return_value=Path("/library")):
            with patch("proxmox_hypervisors.subprocess.run", fake_run):
                payload = run_library(["--host", "192.168.1.20", "nodes"], "secret-pass")
        self.assertEqual(payload["nodes"], ["pve"])
        self.assertNotIn("secret-pass", captured["cmd"])
        self.assertEqual(captured["env"]["PROXMOX_PASSWORD"], "secret-pass")

    def test_vmid_and_token_use_saved_host(self):
        create_hypervisor(
            self.data,
            {
                "name": "lab",
                "host": "192.168.1.20",
                "apiUser": "root@pam",
                "sshUser": "root",
                "password": "secret-pass",
            },
        )
        calls = []

        def fake_run(args, password):
            calls.append((args, password))
            command = args[-1] if "vmid-free" not in args and "create-token" not in args else ""
            if "nodes" in args and "storages" not in args and "bridges" not in args and "vmid-free" not in args:
                return {"ok": True, "nodes": ["pve"]}
            if "storages" in args:
                return {"ok": True, "storages": [{"id": "local-zfs", "type": "zfspool"}]}
            if "bridges" in args:
                return {"ok": True, "bridges": ["vmbr0"]}
            if "vmid-free" in args:
                return {"ok": True, "free": False, "vmid": 220}
            if "create-token" in args:
                return {"ok": True, "token_id": "root@pam!atlas-ui", "secret": "TOKEN"}
            raise AssertionError(command or args)

        with patch("proxmox_hypervisors.run_library", fake_run):
            with patch("proxmox_hypervisors.resolve_atlas_inventory_leaf", return_value=None):
                with patch("proxmox_hypervisors.list_hosts_topology", return_value={"groups": [{"name": "k8s"}]}):
                    status = vmid_status(self.data, "p1", "build/k8s", 220, host="192.168.1.20")
                    token = create_api_token(self.data, "p1", "build/k8s", host="192.168.1.20")
        self.assertTrue(status["checked"])
        self.assertFalse(status["free"])
        self.assertEqual(token["tokenId"], "root@pam!atlas-ui")
        self.assertEqual(token["secret"], "TOKEN")
        for args, password in calls:
            self.assertNotIn("secret-pass", args)
            self.assertEqual(password, "secret-pass")


class LibraryGitTests(unittest.TestCase):
    def test_install_from_local_git(self):
        tmp = tempfile.TemporaryDirectory()
        root = Path(tmp.name)
        source = root / "source"
        dest = root / "dest"
        config = root / "config.json"
        source.mkdir()
        (source / "proxmoxlib").mkdir()
        (source / "proxmox-library").write_text("#!/usr/bin/env python3\n", encoding="utf-8")
        (source / "proxmoxlib" / "__main__.py").write_text("print('no')\n", encoding="utf-8")
        _git(source, "init")
        _git(source, "add", ".")
        _git(source, "commit", "-m", "init")
        _git(source, "branch", "-M", "main")
        previous = os.environ.get("ATLAS_UI_CONFIG")
        os.environ["ATLAS_UI_CONFIG"] = str(config)
        try:
            payload = install_library(url=str(source), dest=str(dest), ref="main")
            saved = json.loads(config.read_text(encoding="utf-8"))
        finally:
            if previous is None:
                os.environ.pop("ATLAS_UI_CONFIG", None)
            else:
                os.environ["ATLAS_UI_CONFIG"] = previous
            tmp.cleanup()
        self.assertTrue(payload["configured"])
        self.assertTrue(payload["ok"])
        self.assertEqual(saved["libraryRoot"], str(dest.resolve()))

    def test_inspect_missing(self):
        tmp = tempfile.TemporaryDirectory()
        previous = os.environ.get("ATLAS_UI_CONFIG")
        os.environ["ATLAS_UI_CONFIG"] = str(Path(tmp.name) / "missing.json")
        try:
            payload = inspect_checkout(dest=str(Path(tmp.name) / "absent"))
        finally:
            if previous is None:
                os.environ.pop("ATLAS_UI_CONFIG", None)
            else:
                os.environ["ATLAS_UI_CONFIG"] = previous
            tmp.cleanup()
        self.assertFalse(payload["configured"])


if __name__ == "__main__":
    unittest.main()
