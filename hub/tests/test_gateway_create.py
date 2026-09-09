import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from project_kind import ProjectKindError
from projects_create import create_project_record


class GatewayCreateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.config = root / "projects.json"
        self.projects_dir = root / "projects"
        self.projects_dir.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_atlas_create_has_repo_and_atlas(self):
        out = create_project_record(
            {"name": "k8s", "kind": "atlas", "cluster_id": "dev/k8s"},
            username="admin",
            config_file=self.config,
            projects_dir=self.projects_dir,
        )
        project = out["project"]
        pdir = self.projects_dir / project["id"]
        self.assertEqual(project["kind"], "atlas")
        self.assertTrue((pdir / "repo" / "playbooks").is_dir())
        self.assertTrue((pdir / "ansible-config" / "ansible.cfg").is_file())
        self.assertTrue((pdir / "atlas").is_dir())
        cfg = json.loads((pdir / "project.json").read_text(encoding="utf-8"))
        self.assertEqual(cfg["kind"], "atlas")
        self.assertEqual(cfg["cluster_id"], "dev/k8s")

    def test_ansible_create_has_playbooks_dir(self):
        out = create_project_record(
            {"name": "play", "kind": "ansible"},
            username="admin",
            config_file=self.config,
            projects_dir=self.projects_dir,
        )
        pdir = self.projects_dir / out["project"]["id"]
        self.assertTrue((pdir / "repo" / "playbooks").is_dir())
        self.assertTrue((pdir / "ansible-config" / "ansible.cfg").is_file())

    def test_atlas_create_requires_cluster_id(self):
        with self.assertRaises(ProjectKindError):
            create_project_record(
                {"name": "k8s", "kind": "atlas"},
                username="admin",
                config_file=self.config,
                projects_dir=self.projects_dir,
            )


if __name__ == "__main__":
    unittest.main()
