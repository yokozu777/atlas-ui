"""Exclusive fcntl locks for JSON documents and append-only logs."""
from __future__ import annotations

import copy
import fcntl
import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator, Optional, TypeVar

T = TypeVar("T")


@contextmanager
def exclusive_file(path: Path, *, append: bool = False) -> Iterator[Any]:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_RDWR | os.O_CREAT
    if append:
        flags |= os.O_APPEND
    fd = os.open(str(path), flags, 0o600)
    handle = None
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        mode = "a" if append else "r+"
        handle = os.fdopen(fd, mode, encoding="utf-8", closefd=False)
        yield handle
        handle.flush()
        os.fsync(handle.fileno())
    finally:
        if handle is not None:
            try:
                handle.close()
            except OSError:
                pass
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        os.close(fd)


def load_json_file(path: Path, default: Any = None) -> Any:
    path = Path(path)
    if default is None:
        default = {}
    if not path.exists():
        return copy.deepcopy(default)
    with exclusive_file(path) as handle:
        handle.seek(0)
        raw = handle.read()
        if not str(raw).strip():
            return copy.deepcopy(default)
        return json.loads(raw)


def update_json_file(
    path: Path,
    mutator: Callable[[Any], Optional[T]],
    *,
    default: Any = None,
) -> Optional[T]:
    """Lock, read JSON, run mutator in-place, write + fsync."""
    path = Path(path)
    if default is None:
        default = {}
    with exclusive_file(path) as handle:
        handle.seek(0)
        raw = handle.read()
        if str(raw).strip():
            data = json.loads(raw)
        else:
            data = copy.deepcopy(default)
        result = mutator(data)
        handle.seek(0)
        handle.truncate()
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
        return result


def append_text_file(path: Path, text: str) -> None:
    chunk = text if text.endswith("\n") else text + "\n"
    with exclusive_file(path, append=True) as handle:
        handle.write(chunk)
