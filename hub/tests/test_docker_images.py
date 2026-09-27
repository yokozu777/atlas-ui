import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import docker_images  # noqa: E402


class _FakeResponse:
    def __init__(self, status: int, body: bytes) -> None:
        self.status = status
        self._body = body

    def read(self) -> bytes:
        return self._body


class _FakeConn:
    last_path = ""
    status = 200
    body = b'{"Id":"sha256:abc"}'

    def __init__(self, unix_path: str, timeout: float = 2.0) -> None:
        self.unix_path = unix_path
        self.timeout = timeout

    def request(self, method: str, path: str) -> None:
        del method
        type(self).last_path = path

    def getresponse(self) -> _FakeResponse:
        return _FakeResponse(self.status, self.body)

    def close(self) -> None:
        return None


class DockerImagesTests(unittest.TestCase):
    def test_missing_socket_is_absent(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            missing = str(Path(raw) / "no.sock")
            with patch.dict(os.environ, {"DOCKER_HOST": f"unix://{missing}"}):
                self.assertFalse(docker_images.docker_image_present("repo/img:tag"))

    def test_inspect_200_is_present(self) -> None:
        with tempfile.NamedTemporaryFile() as sock:
            _FakeConn.status = 200
            _FakeConn.body = b'{"Id":"sha256:abc"}'
            with patch.dict(os.environ, {"DOCKER_HOST": f"unix://{sock.name}"}), patch(
                "docker_images._UnixHTTPConnection",
                _FakeConn,
            ):
                self.assertTrue(
                    docker_images.docker_image_present(
                        "harbor.mxhash.com/library/krang:latest"
                    )
                )
            self.assertIn(
                "harbor.mxhash.com%2Flibrary%2Fkrang%3Alatest",
                _FakeConn.last_path,
            )

    def test_inspect_404_is_absent(self) -> None:
        with tempfile.NamedTemporaryFile() as sock:
            _FakeConn.status = 404
            _FakeConn.body = b'{"message":"No such image"}'
            with patch.dict(os.environ, {"DOCKER_HOST": f"unix://{sock.name}"}), patch(
                "docker_images._UnixHTTPConnection",
                _FakeConn,
            ):
                self.assertFalse(docker_images.docker_image_present("missing:tag"))


if __name__ == "__main__":
    unittest.main()
