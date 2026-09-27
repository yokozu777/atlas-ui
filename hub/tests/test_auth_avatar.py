import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from auth_avatar import (  # noqa: E402
    AVATAR_MAX_BYTES,
    AvatarError,
    delete_avatar,
    has_avatar,
    read_avatar,
    write_avatar,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
JPEG = b"\xff\xd8\xff" + b"\x00" * 24


class AuthAvatarTests(unittest.TestCase):
    def test_write_read_delete_png(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            media = write_avatar(data, "user-1", PNG)
            self.assertEqual(media, "image/png")
            self.assertTrue(has_avatar(data, "user-1"))
            found = read_avatar(data, "user-1")
            self.assertIsNotNone(found)
            path, kind = found
            self.assertEqual(kind, "image/png")
            self.assertEqual(path.read_bytes(), PNG)
            self.assertTrue(delete_avatar(data, "user-1"))
            self.assertFalse(has_avatar(data, "user-1"))

    def test_rejects_non_image(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(AvatarError) as raised:
                write_avatar(Path(tmp), "user-1", b"not-an-image")
            self.assertEqual(raised.exception.status_code, 400)

    def test_rejects_too_large(self):
        with tempfile.TemporaryDirectory() as tmp:
            blob = PNG[:8] + b"\x00" * AVATAR_MAX_BYTES
            with self.assertRaises(AvatarError) as raised:
                write_avatar(Path(tmp), "user-1", blob)
            self.assertEqual(raised.exception.status_code, 400)

    def test_accepts_jpeg(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(write_avatar(Path(tmp), "abc", JPEG), "image/jpeg")


if __name__ == "__main__":
    unittest.main()
