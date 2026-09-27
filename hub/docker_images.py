"""Look up local Docker images via the engine API (unix socket)."""
from __future__ import annotations

import http.client
import os
import socket
from typing import Optional
from urllib.parse import quote

DEFAULT_DOCKER_SOCK = "/var/run/docker.sock"
API_PREFIX = "/v1.41"


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_path: str, timeout: float = 2.0) -> None:
        super().__init__("localhost", timeout=timeout)
        self._unix_path = unix_path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self._unix_path)
        self.sock = sock


def docker_socket_path() -> Optional[str]:
    raw = os.environ.get("DOCKER_HOST", "").strip()
    if raw.startswith("unix://"):
        path = raw[len("unix://") :]
    elif raw.startswith("unix:"):
        path = raw[5:]
    elif raw:
        return None
    else:
        path = DEFAULT_DOCKER_SOCK
    return path if path and os.path.exists(path) else None


def docker_image_present(image_ref: str) -> bool:
    ref = str(image_ref or "").strip()
    if not ref:
        return False
    sock_path = docker_socket_path()
    if not sock_path:
        return False
    conn = _UnixHTTPConnection(sock_path)
    try:
        conn.request("GET", f"{API_PREFIX}/images/{quote(ref, safe='')}/json")
        res = conn.getresponse()
        body = res.read()
        return res.status == 200 and bool(body)
    except OSError:
        return False
    finally:
        conn.close()
