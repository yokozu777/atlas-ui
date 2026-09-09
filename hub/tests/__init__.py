"""Hub unittest env: secrets before gateway import."""
import os

os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-not-for-production")
os.environ.setdefault("ATLAS_ADMIN_PASSWORD", "admin123")
os.environ.setdefault(
    "GLOBAL_SECRETS_ENCRYPTION_KEY",
    "test-encryption-key-not-for-production",
)
