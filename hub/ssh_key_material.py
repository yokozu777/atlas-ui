"""Generate and inspect OpenSSH Ed25519 keys for Global Secrets."""
from __future__ import annotations

import base64
import hashlib
from typing import Any, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519


class SshKeyMaterialError(Exception):
    """Private key is missing, encrypted without a passphrase, or not valid OpenSSH."""


def ssh_fingerprint(openssh_public: str) -> str:
    parts = openssh_public.split()
    if len(parts) < 2:
        return ""
    try:
        blob = base64.b64decode(parts[1])
    except Exception:
        return ""
    digest = hashlib.sha256(blob).digest()
    return "SHA256:" + base64.b64encode(digest).rstrip(b"=").decode("ascii")


def generate_ed25519_openssh(
    *, comment: str = "", passphrase: str = ""
) -> dict[str, str]:
    key = ed25519.Ed25519PrivateKey.generate()
    encryption: Any
    if passphrase:
        encryption = serialization.BestAvailableEncryption(passphrase.encode("utf-8"))
    else:
        encryption = serialization.NoEncryption()
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=encryption,
    ).decode("utf-8")
    public = key.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    ).decode("utf-8")
    comment = " ".join(str(comment or "").split())
    if comment:
        public = f"{public} {comment}"
    if not private_pem.endswith("\n"):
        private_pem += "\n"
    return {
        "privateKey": private_pem,
        "publicKey": public,
        "fingerprint": ssh_fingerprint(public),
        "keyType": "ed25519",
    }


def derive_openssh_public(
    private_key: str, *, passphrase: str = ""
) -> dict[str, str]:
    pem = (private_key or "").strip()
    if not pem:
        return {}
    password = passphrase.encode("utf-8") if passphrase else None
    try:
        key = serialization.load_ssh_private_key(pem.encode("utf-8"), password=password)
    except Exception:
        return {}
    try:
        public = key.public_key().public_bytes(
            encoding=serialization.Encoding.OpenSSH,
            format=serialization.PublicFormat.OpenSSH,
        ).decode("utf-8")
    except Exception:
        return {}
    out = {
        "publicKey": public,
        "fingerprint": ssh_fingerprint(public),
    }
    if public.startswith("ssh-ed25519"):
        out["keyType"] = "ed25519"
    elif public.startswith("ssh-rsa"):
        out["keyType"] = "rsa"
    return out


def load_openssh_private_key(private_key: Any, *, passphrase: str = ""):
    if not private_key or not isinstance(private_key, str):
        raise SshKeyMaterialError("Private key must be a non-empty string")
    pem = private_key.strip()
    if not pem:
        raise SshKeyMaterialError("Private key must be a non-empty string")
    password = passphrase.encode("utf-8") if passphrase else None
    try:
        return serialization.load_ssh_private_key(pem.encode("utf-8"), password=password)
    except Exception as exc:
        raise SshKeyMaterialError("Invalid SSH private key") from exc


def decrypt_openssh_private(private_key: str, *, passphrase: str = "") -> str:
    """Return an unencrypted OpenSSH private key, or raise SshKeyMaterialError."""
    key = load_openssh_private_key(private_key, passphrase=passphrase)
    out = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    if not out.endswith("\n"):
        out += "\n"
    return out


def validate_ssh_private_key(
    private_key: Any, *, passphrase: str = ""
) -> tuple[bool, Optional[str]]:
    try:
        load_openssh_private_key(private_key, passphrase=passphrase)
        return True, None
    except SshKeyMaterialError as exc:
        return False, str(exc)
