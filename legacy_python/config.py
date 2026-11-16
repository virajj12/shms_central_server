"""
Configuration settings for the SHMS Central Management Server.
"""

import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent
SNAPSHOTS_DIR = BASE_DIR / "central_snapshots"
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# Server Binding
HOST = os.getenv("SHMS_CENTRAL_HOST", "0.0.0.0")
PORT = int(os.getenv("SHMS_CENTRAL_PORT", "9000"))

# Security
SECRET_KEY = os.getenv("SHMS_SECRET_KEY", "shms-enterprise-central-secret-key-2026-v1")
SESSION_COOKIE_NAME = "shms_central_session"
SESSION_EXPIRE_HOURS = 24

# Fleet Management Timeouts
HEARTBEAT_TIMEOUT_SECONDS = 30  # Node marked offline if no heartbeat within 30s
HEARTBEAT_CHECK_INTERVAL = 10   # Background task interval to evaluate edge node health

# Database
DATABASE_PATH = str(BASE_DIR / "central_monitoring.db")

# Default Superadmin Credentials
DEFAULT_ADMIN_USER = os.getenv("SHMS_ADMIN_USER", "admin")
DEFAULT_ADMIN_PASS = os.getenv("SHMS_ADMIN_PASS", "admin123")

