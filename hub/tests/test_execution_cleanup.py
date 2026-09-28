import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from execution_cleanup import cleanup_run_generated_playbooks  # noqa: E402


class CleanupRunGeneratedPlaybooksTests(unittest.TestCase):
    def test_atlas_run_without_playbook_does_not_unlink_cwd(self):
        before = set(Path(".").iterdir())
        cleanup_run_generated_playbooks(
            {
                "executor": "clusterctl",
                "argv": ["init", "ext2"],
                "project_dir": "/tmp/project",
            }
        )
        cleanup_run_generated_playbooks({"temp_playbook": "", "temp_inventory": ""})
        cleanup_run_generated_playbooks({"temp_playbook": "."})
        self.assertEqual(set(Path(".").iterdir()), before)

    def test_removes_playbook_inventory_and_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "generated_playbooks"
            root.mkdir()
            playbook = root / "exec.yml"
            inventory = root / "inventory_exec.yml"
            key = root / "key_exec.pem"
            playbook.write_text("---\n", encoding="utf-8")
            key.write_text("key\n", encoding="utf-8")
            inventory.write_text(
                "all:\n"
                "  hosts:\n"
                "    192.168.1.10:\n"
                f"      ansible_ssh_private_key_file: {key}\n",
                encoding="utf-8",
            )
            other = root / "keep.txt"
            other.write_text("stay\n", encoding="utf-8")
            cleanup_run_generated_playbooks(
                {
                    "temp_playbook": str(playbook),
                    "temp_inventory": str(inventory),
                }
            )
            self.assertFalse(playbook.exists())
            self.assertFalse(inventory.exists())
            self.assertFalse(key.exists())
            self.assertTrue(other.is_file())

    def test_directory_paths_are_left_in_place(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cleanup_run_generated_playbooks(
                {
                    "temp_playbook": str(root),
                    "temp_inventory": str(root),
                }
            )
            self.assertTrue(root.is_dir())
            self.assertTrue(os.path.isdir(root))


if __name__ == "__main__":
    unittest.main()
