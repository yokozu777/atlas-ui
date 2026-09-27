import sys
from pathlib import Path as _AuthEnvPath

sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401

import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import clusterctl_git as gitmod  # noqa: E402
import gateway  # noqa: E402
from clusterctl_config import clusterctl_root_from_ui_config  # noqa: E402
from clusterctl_git import (  # noqa: E402
    ClusterctlGitError,
    clone_clusterctl,
    default_dest,
    default_git_url,
    ensure_clusterctl,
    inspect_checkout,
    install_clusterctl,
    latest_ref,
    list_clusterctl_refs,
    parse_ls_remote,
    pull_clusterctl,
)


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
        text=True,
    )


def _init_clusterctl_repo(root: Path) -> Path:
    root.mkdir(parents=True)
    cluster = root / "cluster"
    cluster.write_text("#!/bin/sh\necho clusterctl 0.0-test\n", encoding="utf-8")
    cluster.chmod(cluster.stat().st_mode | stat.S_IEXEC)
    (root / "clusterctl").mkdir()
    (root / "clusterctl" / "__main__.py").write_text("# test\n", encoding="utf-8")
    _git(root, "-c", "init.defaultBranch=main", "init")
    _git(root, "config", "user.email", "test@example.com")
    _git(root, "config", "user.name", "test")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "init")
    return root


def _tag_clusterctl_repo(root: Path) -> Path:
    _git(root, "tag", "0.0.1")
    cluster = root / "cluster"
    cluster.write_text("#!/bin/sh\necho clusterctl 0.0.2-test\n", encoding="utf-8")
    _git(root, "add", "cluster")
    _git(root, "commit", "-m", "0.0.2")
    _git(root, "tag", "0.0.2")
    return root


class ClusterctlGitUnitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self._saved = {
            key: os.environ.get(key)
            for key in (
                "ATLAS_CLUSTER_ROOT",
                "ATLAS_UI_ROOT",
                "ATLAS_CLUSTERCTL_GIT_URL",
                "ATLAS_UI_CONFIG",
            )
        }
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        os.environ.pop("ATLAS_UI_ROOT", None)
        os.environ.pop("ATLAS_CLUSTERCTL_GIT_URL", None)
        cfg = self.root / "ui-config.json"
        os.environ["ATLAS_UI_CONFIG"] = str(cfg)

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def test_run_git_skips_tls_verify(self):
        captured: dict[str, object] = {}

        def fake_run(cmd, **kwargs):
            captured["cmd"] = cmd
            captured["env"] = kwargs.get("env") or {}
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

        with mock.patch("clusterctl_git.subprocess.run", fake_run):
            gitmod._run_git(["status"])
        cmd = captured["cmd"]
        self.assertEqual(cmd[:3], ["git", "-c", "http.sslVerify=false"])
        env = captured["env"]
        self.assertIsInstance(env, dict)
        self.assertEqual(env.get("GIT_SSL_NO_VERIFY"), "1")

    def test_default_url_and_dest(self):
        self.assertEqual(default_git_url(), gitmod.DEFAULT_GIT_URL)
        os.environ["ATLAS_CLUSTERCTL_GIT_URL"] = "https://example.com/ctl.git"
        self.assertEqual(default_git_url(), "https://example.com/ctl.git")
        os.environ["ATLAS_CLUSTER_ROOT"] = str(self.root / "from-env")
        self.assertEqual(default_dest(), (self.root / "from-env").resolve())
        os.environ.pop("ATLAS_CLUSTER_ROOT")
        os.environ["ATLAS_UI_ROOT"] = str(self.root)
        self.assertEqual(default_dest(), (self.root / "atlas-clusterctl").resolve())

    def test_clone_empty_dir_then_pull(self):
        src = _init_clusterctl_repo(self.root / "src")
        dest = self.root / "checkout"
        dest.mkdir()
        cloned = clone_clusterctl(url=str(src), dest=str(dest))
        self.assertTrue(cloned["ok"])
        self.assertTrue(cloned["isRepo"])
        self.assertIn("clusterctl 0.0-test", cloned["version"])
        self.assertEqual(clusterctl_root_from_ui_config(), dest.resolve())

        (src / "README.md").write_text("hello\n", encoding="utf-8")
        _git(src, "add", "README.md")
        _git(src, "commit", "-m", "readme")
        pulled = pull_clusterctl(url=str(src), dest=str(dest))
        self.assertTrue(pulled["ok"])
        self.assertTrue((dest / "README.md").is_file())

    def test_clone_refuses_foreign_files(self):
        src = _init_clusterctl_repo(self.root / "src")
        dest = self.root / "occupied"
        dest.mkdir()
        (dest / "noise.txt").write_text("nope\n", encoding="utf-8")
        with self.assertRaises(ClusterctlGitError) as ctx:
            clone_clusterctl(url=str(src), dest=str(dest))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not empty", ctx.exception.message)

    def test_clone_refuses_existing_repo(self):
        src = _init_clusterctl_repo(self.root / "src")
        dest = self.root / "checkout"
        clone_clusterctl(url=str(src), dest=str(dest))
        with self.assertRaises(ClusterctlGitError) as ctx:
            clone_clusterctl(url=str(src), dest=str(dest))
        self.assertIn("use Pull", ctx.exception.message)

    def test_pull_refuses_origin_mismatch(self):
        src = _init_clusterctl_repo(self.root / "src")
        dest = self.root / "checkout"
        clone_clusterctl(url=str(src), dest=str(dest))
        with self.assertRaises(ClusterctlGitError) as ctx:
            pull_clusterctl(url="https://example.com/other.git", dest=str(dest))
        self.assertIn("origin is", ctx.exception.message)

    def test_inspect_empty_dest(self):
        dest = self.root / "empty"
        dest.mkdir()
        payload = inspect_checkout(url=str(self.root / "src"), dest=str(dest))
        self.assertTrue(payload["exists"])
        self.assertFalse(payload["isRepo"])
        self.assertFalse(payload["configured"])
        self.assertIsNone(payload["error"])

    def test_parse_ls_remote_orders_main_then_tags(self):
        stdout = "\n".join(
            [
                "aaa\trefs/tags/0.0.1",
                "bbb\trefs/heads/main",
                "ccc\trefs/tags/0.0.2",
                "ddd\trefs/heads/dev",
                "eee\trefs/tags/0.0.2^{}",
            ]
        )
        self.assertEqual(parse_ls_remote(stdout), ["main", "0.0.2", "0.0.1"])

    def test_list_refs_and_install_switches_tag(self):
        src = _tag_clusterctl_repo(_init_clusterctl_repo(self.root / "src"))
        listed = list_clusterctl_refs(url=str(src))
        self.assertEqual(listed["refs"], ["main", "0.0.2", "0.0.1"])

        dest = self.root / "checkout"
        dest.mkdir()
        first = install_clusterctl(url=str(src), dest=str(dest), ref="0.0.1")
        self.assertTrue(first["ok"])
        self.assertIn("clusterctl 0.0-test", first["version"])

        second = install_clusterctl(url=str(src), dest=str(dest), ref="0.0.2")
        self.assertTrue(second["ok"])
        self.assertIn("clusterctl 0.0.2-test", second["version"])

    def test_install_refuses_foreign_files(self):
        src = _init_clusterctl_repo(self.root / "src")
        dest = self.root / "occupied"
        dest.mkdir()
        (dest / "noise.txt").write_text("nope\n", encoding="utf-8")
        with self.assertRaises(ClusterctlGitError) as ctx:
            install_clusterctl(url=str(src), dest=str(dest), ref="main")
        self.assertIn("not empty", ctx.exception.message)

    def test_install_rejects_bad_ref(self):
        with self.assertRaises(ClusterctlGitError) as ctx:
            install_clusterctl(url="https://example.com/x.git", dest="/tmp/x", ref="../oops")
        self.assertIn("invalid ref", ctx.exception.message)

    def test_latest_ref_prefers_newest_tag(self):
        self.assertEqual(latest_ref(["main", "0.0.2", "0.0.1"]), "0.0.2")
        self.assertEqual(latest_ref(["main"]), "main")
        with self.assertRaises(ClusterctlGitError):
            latest_ref([])

    def test_ensure_installs_latest_tag_when_empty(self):
        src = _tag_clusterctl_repo(_init_clusterctl_repo(self.root / "src"))
        dest = self.root / "checkout"
        dest.mkdir()
        got = ensure_clusterctl(url=str(src), dest=str(dest))
        self.assertTrue(got["ok"])
        self.assertIn("clusterctl 0.0.2-test", got["version"])
        self.assertTrue(got.get("fetchedAt"))

    def test_ensure_skips_existing_checkout(self):
        src = _tag_clusterctl_repo(_init_clusterctl_repo(self.root / "src"))
        dest = self.root / "checkout"
        dest.mkdir()
        install_clusterctl(url=str(src), dest=str(dest), ref="0.0.1")
        got = ensure_clusterctl(url=str(src), dest=str(dest))
        self.assertIn("clusterctl 0.0-test", got["version"])

    def test_ensure_skips_occupied_dir(self):
        dest = self.root / "occupied"
        dest.mkdir()
        (dest / "noise.txt").write_text("nope\n", encoding="utf-8")
        got = ensure_clusterctl(url=str(self.root / "missing.git"), dest=str(dest))
        self.assertFalse(got["configured"])
        self.assertIn("not empty", got["error"] or "")


class ClusterctlGitHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self._saved = {
            key: os.environ.get(key)
            for key in (
                "ATLAS_CLUSTER_ROOT",
                "ATLAS_UI_ROOT",
                "ATLAS_CLUSTERCTL_GIT_URL",
                "ATLAS_UI_CONFIG",
            )
        }
        os.environ.pop("ATLAS_CLUSTER_ROOT", None)
        os.environ["ATLAS_UI_ROOT"] = str(self.root)
        os.environ["ATLAS_UI_CONFIG"] = str(self.root / "ui-config.json")

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def _login(self):
        res = self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def test_get_requires_auth(self):
        res = self.client.get("/api/atlas/clusterctl")
        self.assertEqual(res.status_code, 401)

    def test_get_and_clone_pull(self):
        headers = self._login()
        src = _init_clusterctl_repo(self.root / "src")
        dest = self.root / "atlas-clusterctl"
        got = self.client.get("/api/atlas/clusterctl", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        body = got.json()
        self.assertTrue(body.get("success"))
        self.assertEqual(body["dest"], str(dest.resolve()))
        self.assertFalse(body["exists"])

        cloned = self.client.post(
            "/api/atlas/clusterctl/clone",
            headers=headers,
            json={"url": str(src), "dest": str(dest)},
        )
        self.assertEqual(cloned.status_code, 200, cloned.text)
        payload = cloned.json()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["isRepo"])
        self.assertIn("clusterctl 0.0-test", payload["version"])

        (src / "extra.txt").write_text("x\n", encoding="utf-8")
        _git(src, "add", "extra.txt")
        _git(src, "commit", "-m", "extra")
        pulled = self.client.post(
            "/api/atlas/clusterctl/pull",
            headers=headers,
            json={"url": str(src), "dest": str(dest)},
        )
        self.assertEqual(pulled.status_code, 200, pulled.text)
        self.assertTrue((dest / "extra.txt").is_file())

        occupied = self.root / "occupied"
        occupied.mkdir()
        (occupied / "noise.txt").write_text("nope\n", encoding="utf-8")
        refused = self.client.post(
            "/api/atlas/clusterctl/clone",
            headers=headers,
            json={"url": str(src), "dest": str(occupied)},
        )
        self.assertEqual(refused.status_code, 400, refused.text)
        self.assertIn("not empty", refused.json()["error"])

    def test_refs_and_install(self):
        headers = self._login()
        src = _tag_clusterctl_repo(_init_clusterctl_repo(self.root / "src"))
        dest = self.root / "from-install"
        refs = self.client.get(
            "/api/atlas/clusterctl/refs",
            headers=headers,
            params={"url": str(src)},
        )
        self.assertEqual(refs.status_code, 200, refs.text)
        self.assertEqual(refs.json()["refs"], ["main", "0.0.2", "0.0.1"])

        installed = self.client.post(
            "/api/atlas/clusterctl/install",
            headers=headers,
            json={"url": str(src), "dest": str(dest), "ref": "0.0.1"},
        )
        self.assertEqual(installed.status_code, 200, installed.text)
        self.assertIn("clusterctl 0.0-test", installed.json()["version"])

        updated = self.client.post(
            "/api/atlas/clusterctl/install",
            headers=headers,
            json={"url": str(src), "dest": str(dest), "ref": "0.0.2"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertIn("clusterctl 0.0.2-test", updated.json()["version"])

    def test_ensure_latest_and_fetched_at(self):
        headers = self._login()
        src = _tag_clusterctl_repo(_init_clusterctl_repo(self.root / "src"))
        dest = self.root / "from-ensure"
        ensured = self.client.post(
            "/api/atlas/clusterctl/ensure",
            headers=headers,
            json={"url": str(src), "dest": str(dest)},
        )
        self.assertEqual(ensured.status_code, 200, ensured.text)
        body = ensured.json()
        self.assertIn("clusterctl 0.0.2-test", body["version"])
        self.assertTrue(body.get("fetchedAt"))

        again = self.client.get(
            "/api/atlas/clusterctl",
            headers=headers,
            params={"url": str(src), "dest": str(dest)},
        )
        self.assertEqual(again.status_code, 200, again.text)
        self.assertTrue(again.json().get("fetchedAt"))
        self.assertTrue(again.json().get("ok"))


if __name__ == "__main__":
    unittest.main()
