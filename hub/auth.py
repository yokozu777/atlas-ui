#!/usr/bin/env python3
"""
Модуль для работы с JWT токенами аутентификации
"""
import os
import uuid
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

try:
    from lab_secrets import resolve_jwt_secret
except ImportError:
    from .lab_secrets import resolve_jwt_secret  # type: ignore

from json_file_lock import update_json_file
import json

JWT_ALGORITHM = 'HS256'


def jwt_secret_key(data_dir: Path) -> str:
    return resolve_jwt_secret(data_dir)
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '60'))  # 1 hour default
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get('JWT_REFRESH_TOKEN_EXPIRE_DAYS', '7'))  # 7 дней


def get_token_blacklist_path(data_dir: Path) -> Path:
    """Получить путь к файлу с blacklist токенов"""
    auth_dir = data_dir / 'auth'
    auth_dir.mkdir(exist_ok=True)
    return auth_dir / 'token_blacklist.json'


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _purge_expired(data: dict, now: float) -> dict:
    return {
        key: exp
        for key, exp in data.items()
        if isinstance(exp, (int, float)) and exp > now
    }


def add_jti_to_blacklist(data_dir: Path, jti: str, exp_ts: Optional[float] = None) -> None:
    if not jti:
        return
    now = _utcnow().timestamp()
    expires = float(exp_ts) if exp_ts else now + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS).total_seconds()

    def mutator(data):
        if not isinstance(data, dict):
            data.clear()
            data.update({})
        live = _purge_expired(data, now)
        data.clear()
        data.update(live)
        data[str(jti)] = expires

    update_json_file(get_token_blacklist_path(data_dir), mutator, default={})


def add_token_to_blacklist(data_dir: Path, token: str) -> None:
    """Blacklist a JWT by jti (legacy tokens without jti use the raw token)."""
    if not token:
        return
    payload = decode_token(token) or {}
    jti = str(payload.get("jti") or "").strip() or token
    exp = payload.get("exp")
    try:
        exp_ts = float(exp) if exp is not None else None
    except (TypeError, ValueError):
        exp_ts = None
    add_jti_to_blacklist(data_dir, jti, exp_ts)


def is_jti_blacklisted(data_dir: Path, jti: str) -> bool:
    if not jti:
        return False
    path = get_token_blacklist_path(data_dir)
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict):
        return False
    exp = data.get(str(jti))
    try:
        return float(exp) > _utcnow().timestamp()
    except (TypeError, ValueError):
        return False


def is_token_blacklisted(data_dir: Path, token: str) -> bool:
    payload = decode_token(token) or {}
    jti = str(payload.get("jti") or "").strip()
    if jti and is_jti_blacklisted(data_dir, jti):
        return True
    return is_jti_blacklisted(data_dir, token)


def generate_token(user_id: str, username: str, roles: list, data_dir: Path, 
                   token_type: str = 'access', expires_delta: Optional[timedelta] = None,
                   extra: Optional[Dict[str, Any]] = None) -> str:
    """
    Генерировать JWT токен для пользователя
    """
    if expires_delta is None:
        if token_type == 'refresh':
            expires_delta = timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        else:
            expires_delta = timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    expire = _utcnow() + expires_delta
    
    payload = {
        'user_id': user_id,
        'username': username,
        'roles': roles,
        'token_type': token_type,
        'jti': str(uuid.uuid4()),
        'exp': expire,
        'iat': _utcnow(),
    }
    
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, jwt_secret_key(data_dir), algorithm=JWT_ALGORITHM)
    return token


def verify_token(token: str, data_dir: Path, token_type: str = 'access') -> Optional[Dict[str, Any]]:
    """
    Проверить и декодировать JWT токен
    """
    try:
        payload = jwt.decode(token, jwt_secret_key(data_dir), algorithms=[JWT_ALGORITHM])
        jti = str(payload.get("jti") or "").strip()
        if (jti and is_jti_blacklisted(data_dir, jti)) or is_jti_blacklisted(data_dir, token):
            logger.warning("Attempt to use blacklisted token")
            return None
        if payload.get('token_type') != token_type:
            logger.warning(f"Invalid token type. Expected {token_type}, got {payload.get('token_type')}")
            return None
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None
    except Exception as e:
        logger.error(f"Error verifying token: {e}")
        return None


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Декодировать JWT токен без проверки подписи (только для чтения данных)
    """
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
    except Exception as e:
        logger.warning(f"Error decoding token: {e}")
        return None


def get_token_from_header(auth_header: Optional[str]) -> Optional[str]:
    """
    Извлечь токен из заголовка Authorization
    """
    if not auth_header:
        return None
    
    try:
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return None
        return parts[1]
    except Exception:
        return None
