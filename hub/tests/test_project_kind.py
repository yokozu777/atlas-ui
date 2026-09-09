import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from project_kind import (
    ProjectKindError,
    apply_create_fields,
    ensure_ansible_infra_layout,
    ensure_project_layout,
    materialize_created_project,
    normalize_kind,
    reject_kind_mutation,
    with_kind,
)


class ProjectKindTests(unittest.TestCase):
    def test_normalize_defaults_legacy(self):
        self.assertEqual(normalize_kind(None), "ansible")
        self.assertEqual(normalize_kind(""), "ansible")
        self.assertEqual(with_kind({"id": "1"})["kind"], "ansible")

    def test_normalize_required(self):
        with self.assertRaises(ProjectKindError):
            normalize_kind(None, required=True)
        with self.assertRaises(ProjectKindError):
            normalize_kind("terraform", required=True)

    def test_ansible_layout_has_repo_skeleton(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "p1"
            ensure_project_layout(root, "ansible")
            self.assertTrue((root / "repo" / "playbooks").is_dir())
            self.assertTrue((root / "ansible-config").is_dir())
            self.assertTrue((root / "history" / "executions").is_dir())

    def test_atlas_layout_has_repo_and_atlas(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "p1"
            ensure_project_layout(root, "atlas")
            self.assertTrue((root / "repo" / "playbooks").is_dir())
            self.assertTrue((root / "repo" / "inventories").is_dir())
            self.assertTrue((root / "repo" / "roles").is_dir())
            self.assertTrue((root / "ansible-config").is_dir())
            self.assertTrue((root / "atlas").is_dir())
            self.assertTrue((root / "history" / "executions").is_dir())

    def test_lazy_infra_layout_creates_repo_on_existing_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "legacy-atlas"
            root.mkdir()
            (root / "atlas").mkdir()
            self.assertFalse((root / "repo").exists())
            ensure_ansible_infra_layout(root)
            self.assertTrue((root / "repo" / "inventories").is_dir())
            self.assertTrue((root / "repo" / "roles").is_dir())
            self.assertTrue((root / "ansible-config").is_dir())

    def test_kind_immutable(self):
        reject_kind_mutation({"kind": "ansible"}, {"name": "x"})
        with self.assertRaises(ProjectKindError):
            reject_kind_mutation({"kind": "ansible"}, {"kind": "atlas"})

    def test_atlas_create_requires_cluster_id(self):
        with self.assertRaises(ProjectKindError):
            apply_create_fields({"kind": "atlas", "name": "k8s"})
        fields = apply_create_fields({"kind": "atlas", "cluster_id": "dev/k8s"})
        self.assertEqual(fields["kind"], "atlas")
        self.assertEqual(fields["cluster_id"], "dev/k8s")

    def test_materialize_atlas_has_repo_and_atlas(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "atlas-proj"
            materialize_created_project(
                root, {"kind": "atlas", "cluster_id": "dev/k8s"}
            )
            self.assertTrue((root / "repo" / "playbooks").is_dir())
            self.assertTrue((root / "ansible-config" / "ansible.cfg").is_file())
            self.assertTrue((root / "atlas").is_dir())
            cfg = json.loads((root / "project.json").read_text(encoding="utf-8"))
            self.assertEqual(cfg["kind"], "atlas")
            self.assertEqual(cfg["cluster_id"], "dev/k8s")
            self.assertEqual(cfg.get("sources"), {})

    def test_materialize_ansible_writes_ansible_cfg(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "ans"
            materialize_created_project(root, {"kind": "ansible"})
            self.assertTrue((root / "repo" / "playbooks").is_dir())
            self.assertTrue((root / "ansible-config" / "ansible.cfg").is_file())


if __name__ == "__main__":
    unittest.main()
