"""Set hub test secrets before any `import gateway`.

`python -m unittest discover -s tests` loads test_*.py as top-level modules,
so tests/__init__.py does not run. Import this module first in those files.
"""
import os

os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-not-for-production")
os.environ.setdefault("ATLAS_ADMIN_PASSWORD", "admin123")
os.environ.setdefault(
    "GLOBAL_SECRETS_ENCRYPTION_KEY",
    "test-encryption-key-not-for-production",
)
