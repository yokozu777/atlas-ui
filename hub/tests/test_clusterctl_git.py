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
    inspect_checkout,
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


if __name__ == "__main__":
    unittest.main()
