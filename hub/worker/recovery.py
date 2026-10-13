#!/usr/bin/env python3
"""Deprecated worker recovery shim.

Stuck CANCELING recovery runs on the hub (see executions_recovery.py).
This module remains for import compatibility only.
"""
from __future__ import annotations

import logging
import warnings

logger = logging.getLogger(__name__)


def recover_stuck_runs(max_age_minutes=30, max_cancel_minutes=5):
    """No-op on workers. Hub sweeper owns CANCELING timeout recovery."""
    warnings.warn(
        "worker.recovery.recover_stuck_runs is deprecated; "
        "use executions_recovery.recover_stuck_canceling on the hub",
        DeprecationWarning,
        stacklevel=2,
    )
    logger.debug(
        "recover_stuck_runs ignored on worker "
        "(max_age=%s max_cancel=%s) — hub executions_recovery handles CANCELING",
        max_age_minutes,
        max_cancel_minutes,
    )
    return 0
