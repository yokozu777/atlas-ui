"""One ICMP echo to see whether an IPv4 address answers."""
from __future__ import annotations

import ipaddress
import subprocess


class AddressProbeError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def probe_ipv4(raw: str) -> dict[str, object]:
    text = str(raw or "").strip()
    try:
        address = ipaddress.IPv4Address(text)
    except ipaddress.AddressValueError as exc:
        raise AddressProbeError(400, "IP must be an IPv4 address") from exc
    if (
        address.is_multicast
        or address.is_unspecified
        or address.is_loopback
        or address.is_reserved
        or address.is_link_local
    ):
        raise AddressProbeError(400, "IP is not a host address")
    target = str(address)
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", "2", target],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except FileNotFoundError:
        return {
            "ip": target,
            "checked": False,
            "reachable": None,
            "error": "ping is not installed on the hub",
        }
    except subprocess.TimeoutExpired:
        return {"ip": target, "checked": True, "reachable": False, "error": None}
    stderr = (result.stderr or "").lower()
    if result.returncode != 0 and (
        "operation not permitted" in stderr or "permission denied" in stderr
    ):
        return {
            "ip": target,
            "checked": False,
            "reachable": None,
            "error": "ping is not permitted on the hub",
        }
    return {
        "ip": target,
        "checked": True,
        "reachable": result.returncode == 0,
        "error": None,
    }
