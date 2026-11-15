"""
Authentication and session security for SHMS Central Server.
Uses standard library hashlib HMAC/PBKDF2 without heavy external binary requirements.
"""

import hmac
import hashlib
import time
import base64
import json
from typing import Optional
from fastapi import Request, HTTPException, status
from config import SECRET_KEY, SESSION_COOKIE_NAME, SESSION_EXPIRE_HOURS


def hash_password(password: str, salt: Optional[str] = None) -> str:
    """Hashes a password with PBKDF2-HMAC-SHA256."""
    if salt is None:
        salt = base64.b64encode(hashlib.sha256(str(time.time()).encode()).digest()[:16]).decode()
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    )
    return f"{salt}${base64.b64encode(key).decode()}"


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Verifies a plain password against the stored salt$hash string."""
    try:
        salt, key_b64 = stored_hash.split("$", 1)
        expected_key = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            100_000,
        )
        return hmac.compare_digest(base64.b64encode(expected_key).decode(), key_b64)
    except Exception:
        return False


def create_session_token(
    username: str,
    role: str = "superadmin",
    owner_id: Optional[str] = None,
    is_superadmin: bool = False,
) -> str:
    """Generates a tamper-proof HMAC-signed session token with expiration timestamp."""
    payload = {
        "user": username,
        "role": role,
        "owner_id": owner_id,
        "is_superadmin": is_superadmin,
        "exp": int(time.time()) + (SESSION_EXPIRE_HOURS * 3600),
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()
    signature = hmac.new(
        SECRET_KEY.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_session_token(token: str) -> Optional[dict]:
    """Validates signature and expiration of an HMAC session token."""
    if not token or "." not in token:
        return None
    try:
        payload_b64, signature = token.split(".", 1)
        expected_sig = hmac.new(
            SECRET_KEY.encode(),
            payload_b64.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
        payload = json.loads(payload_json)
        if time.time() > payload.get("exp", 0):
            return None
        payload["owner_id"] = payload.get("owner_id") or "OWN-DEFAULT-SYSTEM"
        payload["is_superadmin"] = bool(payload.get("is_superadmin"))
        return payload
    except Exception:
        return None


async def get_current_admin(request: Request) -> dict:
    """FastAPI dependency to extract and verify admin user session."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    
    user = verify_session_token(token) if token else None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to the SHMS Central Admin Portal.",
        )
    return user

