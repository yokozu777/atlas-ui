import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_rbac import EXECUTE_ERROR, ROOT_SSH_ERROR, atlas_run_error


class AtlasRbacTests(unittest.TestCase):
    def test_execute_required(self):
        self.assertEqual(
            atlas_run_error(can_execute=False, can_root_ssh=False, root_ssh=False),
            EXECUTE_ERROR,
        )

    def test_execute_does_not_grant_root_ssh(self):
        self.assertEqual(
            atlas_run_error(can_execute=True, can_root_ssh=False, root_ssh=True),
            ROOT_SSH_ERROR,
        )

    def test_root_ssh_allowed_with_named_permission(self):
        self.assertIsNone(
            atlas_run_error(can_execute=True, can_root_ssh=True, root_ssh=True)
        )

    def test_execute_without_root_ssh(self):
        self.assertIsNone(
            atlas_run_error(can_execute=True, can_root_ssh=False, root_ssh=False)
        )


if __name__ == "__main__":
    unittest.main()
