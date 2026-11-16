"""
SQLite database persistence layer for SHMS Central Server.
Uses Write-Ahead Logging (WAL) and thread-safe connections.
"""

import sqlite3
import threading
import json
import secrets
import hashlib
import hmac
import time
from datetime import datetime
from typing import Optional, List, Dict, Any
from config import (
    DATABASE_PATH,
    DEFAULT_ADMIN_USER,
    DEFAULT_ADMIN_PASS,
    SECRET_KEY,
)
from auth import hash_password


TOKEN_HASH_PREFIX = "hmac_sha256$"
DEFAULT_OWNER_ID = "OWN-DEFAULT-SYSTEM"
DEFAULT_OWNER_COMPANY = "Default Hotel Management"
DEFAULT_OWNER_EMAIL = "default-owner@shms.local"


def hash_edge_token(token: str) -> str:
    """Return a peppered HMAC-SHA256 digest for an edge auth token."""
    digest = hmac.new(
        SECRET_KEY.encode("utf-8"),
        str(token).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{TOKEN_HASH_PREFIX}{digest}"


class CentralDatabase:
    """Thread-safe SQLite database manager for SHMS Central Server."""

    def __init__(self, db_path: str = DATABASE_PATH):
        self.db_path = db_path
        self._local = threading.local()
        self._init_tables()
        self._init_default_admin()

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA foreign_keys=ON")
            self._local.conn = conn
        return self._local.conn

    def _init_tables(self):
        with self._get_conn() as conn:
            # 0. Tenant Owners
            conn.execute("""
                CREATE TABLE IF NOT EXISTS owners (
                    id TEXT PRIMARY KEY,
                    company_name TEXT NOT NULL,
                    contact_email TEXT NOT NULL,
                    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'trial')),
                    max_kitchens INTEGER DEFAULT 20,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                INSERT OR IGNORE INTO owners (id, company_name, contact_email, status, max_kitchens)
                VALUES (?, ?, ?, 'active', 20)
            """, (DEFAULT_OWNER_ID, DEFAULT_OWNER_COMPANY, DEFAULT_OWNER_EMAIL))

            # 1. Pairing Codes
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pairing_codes (
                    code TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    hotel_name TEXT NOT NULL,
                    kitchen_name TEXT,
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    used INTEGER DEFAULT 0,
                    used_by_edge_id TEXT,
                    used_at TIMESTAMP
                )
            """)

            # 2. Edge Nodes Fleet Registry
            conn.execute("""
                CREATE TABLE IF NOT EXISTS edge_nodes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    hotel_name TEXT NOT NULL,
                    location TEXT NOT NULL,
                    ip_address TEXT,
                    api_url TEXT NOT NULL,
                    status TEXT DEFAULT 'online',
                    cameras_json TEXT DEFAULT '[]',
                    telemetry_json TEXT DEFAULT '{}',
                    config_json TEXT DEFAULT '{}',
                    pending_commands_json TEXT DEFAULT '[]',
                    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    auth_token TEXT,
                    owner_id TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM',
                    enrollment_status TEXT NOT NULL DEFAULT 'pending',
                    request_id TEXT,
                    pairing_pin TEXT,
                    approved_by TEXT,
                    approved_at TIMESTAMP,
                    rejection_reason TEXT,
                    last_hourly_sync TIMESTAMP,
                    unsynced_count INTEGER DEFAULT 0
                )
            """)

            # 2. Fleet-wide Incidents & Evidence
            conn.execute("""
                CREATE TABLE IF NOT EXISTS fleet_violations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    edge_id TEXT NOT NULL,
                    edge_name TEXT,
                    hotel_name TEXT,
                    camera_id TEXT NOT NULL,
                    camera_name TEXT,
                    label TEXT NOT NULL,
                    category TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    confidence REAL DEFAULT 0.0,
                    amfv_ratio REAL DEFAULT 0.0,
                    snapshot_filename TEXT,
                    snapshot_path TEXT,
                    acknowledged INTEGER DEFAULT 0,
                    reviewed_by TEXT,
                    reviewed_at TIMESTAMP,
                    local_violation_id INTEGER,
                    owner_id TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM',
                    FOREIGN KEY (edge_id) REFERENCES edge_nodes(id) ON DELETE CASCADE
                )
            """)

            # 3. Admin Users
            conn.execute("""
                CREATE TABLE IF NOT EXISTS admin_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'superadmin',
                    owner_id TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM',
                    is_superadmin INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 4. Central System Settings
            conn.execute("""
                CREATE TABLE IF NOT EXISTS central_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 5. Audit Trail
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_edge_id TEXT,
                    details TEXT
                )
            """)

            # Migrations for databases created before duplex/multi-tenant support.
            self._ensure_column(conn, "edge_nodes", "auth_token", "TEXT")
            self._ensure_column(conn, "edge_nodes", "last_hourly_sync", "TIMESTAMP")
            self._ensure_column(conn, "edge_nodes", "unsynced_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "edge_nodes", "owner_id", "TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM'")
            self._ensure_column(conn, "edge_nodes", "enrollment_status", "TEXT NOT NULL DEFAULT 'pending'")
            self._ensure_column(conn, "edge_nodes", "request_id", "TEXT")
            self._ensure_column(conn, "edge_nodes", "pairing_pin", "TEXT")
            self._ensure_column(conn, "edge_nodes", "approved_by", "TEXT")
            self._ensure_column(conn, "edge_nodes", "approved_at", "TIMESTAMP")
            self._ensure_column(conn, "edge_nodes", "rejection_reason", "TEXT")
            self._ensure_column(conn, "fleet_violations", "local_violation_id", "INTEGER")
            self._ensure_column(conn, "fleet_violations", "owner_id", "TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM'")
            self._ensure_column(conn, "admin_users", "owner_id", "TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM'")
            self._ensure_column(conn, "admin_users", "is_superadmin", "INTEGER DEFAULT 0")
            conn.execute(
                """
                UPDATE edge_nodes
                SET enrollment_status = 'approved'
                WHERE auth_token IS NOT NULL
                  AND (enrollment_status IS NULL OR enrollment_status = 'pending')
                """
            )
            self._hash_legacy_edge_tokens(conn)

            with self._get_conn() as conn:
                conn.execute("UPDATE edge_nodes SET owner_id = ? WHERE owner_id IS NULL", (DEFAULT_OWNER_ID,))
                conn.execute(
                    "UPDATE fleet_violations SET owner_id = ? WHERE owner_id IS NULL",
                    (DEFAULT_OWNER_ID,),
                )
                conn.execute(
                    "UPDATE admin_users SET owner_id = ? WHERE owner_id IS NULL",
                    (DEFAULT_OWNER_ID,),
                )

            # Indexes for ultra-fast dashboard queries
            conn.execute("CREATE INDEX IF NOT EXISTS idx_violations_timestamp ON fleet_violations(timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_violations_edge ON fleet_violations(edge_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_violations_category ON fleet_violations(category)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_violations_owner ON fleet_violations(owner_id, timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_edge_status ON edge_nodes(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_edge_owner_status ON edge_nodes(owner_id, enrollment_status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pairing_owner ON pairing_codes(owner_id, code, used)")
            conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_violations_local
                ON fleet_violations(edge_id, local_violation_id)
                WHERE local_violation_id IS NOT NULL
            """)

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str):
        """Add a column to an existing table when it is missing (simple migration)."""
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    @staticmethod
    def _hash_legacy_edge_tokens(conn: sqlite3.Connection):
        """Hash any plaintext edge token left by pre-hashing databases."""
        rows = conn.execute(
            """SELECT id, auth_token FROM edge_nodes
               WHERE auth_token IS NOT NULL AND auth_token != ''
                 AND auth_token NOT LIKE ?""",
            (f"{TOKEN_HASH_PREFIX}%",),
        ).fetchall()
        for row in rows:
            conn.execute(
                "UPDATE edge_nodes SET auth_token = ? WHERE id = ?",
                (hash_edge_token(row["auth_token"]), row["id"]),
            )

    # ── Multi-Tenant Owners & Enrollment Operations ─────────────────────────

    def get_owner(self, owner_id: str) -> Optional[dict]:
        with self._get_conn() as conn:
            cur = conn.execute("SELECT * FROM owners WHERE id = ?", (owner_id,))
            row = cur.fetchone()
            if not row:
                return None
            owner = dict(row)
            owner["status"] = str(owner.get("status") or "active").lower()
            owner["max_kitchens"] = int(owner.get("max_kitchens") or 0)
            return owner

    def get_or_create_owner(
        self,
        owner_id: str,
        company_name: str = DEFAULT_OWNER_COMPANY,
        contact_email: str = DEFAULT_OWNER_EMAIL,
        status: str = "active",
        max_kitchens: int = 20,
    ) -> dict:
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO owners (id, company_name, contact_email, status, max_kitchens)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    company_name = excluded.company_name,
                    contact_email = excluded.contact_email,
                    status = excluded.status,
                    max_kitchens = excluded.max_kitchens
                """,
                (owner_id, company_name, contact_email, status, max_kitchens),
            )
            return self.get_owner(owner_id) or {}

    def list_owners(self) -> List[dict]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM owners ORDER BY id ASC").fetchall()
            owners = []
            for row in rows:
                owner = dict(row)
                owner["status"] = str(owner.get("status") or "active").lower()
                owner["max_kitchens"] = int(owner.get("max_kitchens") or 0)
                owners.append(owner)
            return owners

    def create_pairing_code(
        self,
        owner_id: str,
        code: str,
        hotel_name: str,
        kitchen_name: str,
        expires_at: str,
        created_by: str,
    ) -> bool:
        with self._get_conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO pairing_codes (code, owner_id, hotel_name, kitchen_name, created_by, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    owner_id = excluded.owner_id,
                    hotel_name = excluded.hotel_name,
                    kitchen_name = excluded.kitchen_name,
                    created_by = excluded.created_by,
                    expires_at = excluded.expires_at,
                    used = 0,
                    used_by_edge_id = NULL,
                    used_at = NULL
                """,
                (code, owner_id, hotel_name, kitchen_name, created_by, expires_at),
            )
            return cur.rowcount > 0

    def get_pairing_code(self, code: str, owner_id: str) -> Optional[dict]:
        with self._get_conn() as conn:
            cur = conn.execute(
                """
                SELECT * FROM pairing_codes
                WHERE code = ? AND owner_id = ? AND used = 0
                  AND expires_at > datetime('now', 'localtime')
                """,
                (code, owner_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    def mark_pairing_code_used(self, code: str, owner_id: str, edge_id: str) -> bool:
        with self._get_conn() as conn:
            cur = conn.execute(
                """
                UPDATE pairing_codes
                SET used = 1, used_by_edge_id = ?, used_at = datetime('now', 'localtime')
                WHERE code = ? AND owner_id = ? AND used = 0
                """,
                (edge_id, code, owner_id),
            )
            return cur.rowcount > 0

    def get_edge_enrollment(self, request_id: str, owner_id: Optional[str] = None) -> Optional[dict]:
        with self._get_conn() as conn:
            cur = conn.execute("SELECT * FROM edge_nodes WHERE request_id = ?", (request_id,))
            row = cur.fetchone()
            if not row:
                return None
            node = dict(row)
            if owner_id and node.get("owner_id") != owner_id:
                return None
            return node

    def list_pending_edges(self, owner_id: str) -> List[dict]:
        with self._get_conn() as conn:
            cur = conn.execute(
                """
                SELECT * FROM edge_nodes
                WHERE owner_id = ? AND enrollment_status = 'pending'
                ORDER BY created_at DESC
                """,
                (owner_id,),
            )
            return [dict(r) for r in cur.fetchall()]

    def set_edge_enrollment_status(
        self,
        request_id: str,
        owner_id: str,
        status: str,
        approved_by: Optional[str] = None,
        auth_token: Optional[str] = None,
        rejection_reason: Optional[str] = None,
    ) -> Optional[dict]:
        stored_token = hash_edge_token(auth_token) if auth_token else None
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE edge_nodes
                SET enrollment_status = ?,
                    approved_by = ?,
                    approved_at = datetime('now', 'localtime'),
                    rejection_reason = ?,
                    auth_token = COALESCE(?, auth_token)
                WHERE request_id = ? AND owner_id = ?
                """,
                (status, approved_by, rejection_reason, stored_token, request_id, owner_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM edge_nodes WHERE request_id = ? AND owner_id = ?",
                (request_id, owner_id),
            ).fetchone()
            return dict(row) if row else None

    def _init_default_admin(self):
        """Ensures at least one superadmin account exists."""
        with self._get_conn() as conn:
            cur = conn.execute("SELECT id FROM admin_users WHERE username = ?", (DEFAULT_ADMIN_USER,))
            if not cur.fetchone():
                pw_hash = hash_password(DEFAULT_ADMIN_PASS)
                conn.execute(
                    "INSERT INTO admin_users (username, password_hash, role, owner_id, is_superadmin) VALUES (?, ?, ?, ?, 1)",
                    (DEFAULT_ADMIN_USER, pw_hash, "superadmin", DEFAULT_OWNER_ID)
                )
            else:
                conn.execute(
                    "UPDATE admin_users SET owner_id = ?, is_superadmin = 1 WHERE username = ? AND (owner_id IS NULL OR is_superadmin = 0)",
                    (DEFAULT_OWNER_ID, DEFAULT_ADMIN_USER)
                )

    # ── Edge Nodes Fleet Operations ──────────────────────────────────────────

    def register_or_update_node(
        self,
        edge_id: str,
        name: str,
        hotel_name: str,
        location: str,
        api_url: str,
        ip_address: Optional[str] = None,
        cameras: Optional[list] = None,
        config: Optional[dict] = None,
        owner_id: str = DEFAULT_OWNER_ID,
    ) -> dict:
        """Registers a new edge node or updates an existing one."""
        cameras_json = json.dumps(cameras or [])
        config_json = json.dumps(config or {})
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO edge_nodes (id, name, hotel_name, location, ip_address, api_url, owner_id, status, cameras_json, config_json, last_heartbeat)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    hotel_name = excluded.hotel_name,
                    location = excluded.location,
                    ip_address = COALESCE(excluded.ip_address, edge_nodes.ip_address),
                    api_url = excluded.api_url,
                    owner_id = excluded.owner_id,
                    status = 'online',
                    cameras_json = excluded.cameras_json,
                    config_json = excluded.config_json,
                    last_heartbeat = excluded.last_heartbeat
            """, (edge_id, name, hotel_name, location, ip_address, api_url, owner_id, cameras_json, config_json, now))

        return self.get_node(edge_id)

    def register_kitchen_connection(
        self,
        hotel_name: str,
        kitchen_name: str,
        location: str,
        cameras_count: int = 0,
        system_info: Optional[dict] = None,
        api_url: str = "",
        ip_address: Optional[str] = None,
        kitchen_id: Optional[str] = None,
        owner_id: str = DEFAULT_OWNER_ID,
        pairing_code: Optional[str] = None,
        hardware_fingerprint: Optional[str] = None,
    ) -> dict:
        """Creates or re-enrolls a duplex-capable kitchen node and returns credentials."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        config_json = json.dumps(
            {"cameras_count": cameras_count, "system_info": system_info or {}}
        )
        owner = self.get_owner(owner_id)
        if not owner or owner["status"] != "active":
            raise ValueError("Owner ID is invalid or account is suspended")
        requested_id = str(kitchen_id or "").strip()
        if requested_id and self.get_node(requested_id):
            auth_token = f"sec_tok_{secrets.token_urlsafe(24)}"
            stored_token = hash_edge_token(auth_token)
            with self._get_conn() as conn:
                conn.execute(
                    """
                    UPDATE edge_nodes
                    SET name = ?, hotel_name = ?, location = ?, ip_address = ?,
                        api_url = ?, status = 'approved', enrollment_status = 'approved',
                        config_json = ?, owner_id = ?, auth_token = ?, last_heartbeat = ?
                    WHERE id = ?
                    """,
                    (
                        kitchen_name,
                        hotel_name,
                        location,
                        ip_address,
                        api_url,
                        config_json,
                        owner_id,
                        stored_token,
                        now,
                        requested_id,
                    ),
                )
            return {
                "kitchen_id": requested_id,
                "auth_token": auth_token,
                "status": "approved",
                "owner_id": owner_id,
                "node": self.get_node(requested_id),
            }

        for _ in range(5):
            kitchen_id = f"ktc_{secrets.token_hex(4)}"
            request_id = f"req_{secrets.token_hex(8)}"
            auth_token = f"sec_tok_{secrets.token_urlsafe(24)}"
            stored_token = hash_edge_token(auth_token)
            pin = str(secrets.randbelow(1_000_000))
            try:
                with self._get_conn() as conn:
                    conn.execute(
                        """
                        INSERT INTO edge_nodes (
                            id, name, hotel_name, location, ip_address, api_url, owner_id, status,
                            cameras_json, config_json, pending_commands_json, last_heartbeat,
                            auth_token, request_id, pairing_pin, last_hourly_sync, unsynced_count
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            kitchen_id,
                            kitchen_name,
                            hotel_name,
                            location,
                            ip_address,
                            api_url,
                            owner_id,
                            "pending",
                            "[]",
                            config_json,
                            "[]",
                            now,
                            None,
                            request_id,
                            pin,
                            now,
                            0,
                        ),
                    )

                if pairing_code:
                    pairing = self.get_pairing_code(str(pairing_code).strip(), owner_id)
                    if not pairing:
                        raise ValueError("Invalid or expired pairing code")
                    if not self.mark_pairing_code_used(str(pairing_code).strip(), owner_id, kitchen_id):
                        raise ValueError("Pairing code was already used")
                    with self._get_conn() as conn:
                        conn.execute(
                            """
                            UPDATE edge_nodes
                            SET status = 'approved', enrollment_status = 'approved',
                                auth_token = ?, approved_by = 'owner',
                                approved_at = datetime('now', 'localtime'), pairing_pin = ?
                            WHERE id = ?
                            """,
                            (stored_token, pin, kitchen_id),
                        )
                    return {
                        "kitchen_id": kitchen_id,
                        "auth_token": auth_token,
                        "status": "approved",
                        "owner_id": owner_id,
                        "request_id": request_id,
                        "pairing_code": str(pairing_code).strip(),
                        "node": self.get_node(kitchen_id),
                    }

                return {
                    "kitchen_id": kitchen_id,
                    "auth_token": None,
                    "status": "pending",
                    "owner_id": owner_id,
                    "request_id": request_id,
                    "pairing_code": None,
                    "pin": pin,
                    "node": self.get_node(kitchen_id),
                }
            except sqlite3.IntegrityError:
                continue
        raise RuntimeError("Could not allocate a unique kitchen ID")

    def edge_has_token(self, edge_id: str) -> bool:
        """Return True when the node already has a stored token hash."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT auth_token FROM edge_nodes WHERE id = ?", (edge_id,)
            ).fetchone()
            return bool(row and row["auth_token"])

    def verify_edge_token(self, edge_id: str, token: Optional[str]) -> bool:
        """Compare a presented edge token against the stored HMAC digest."""
        if not token:
            return False
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT auth_token FROM edge_nodes WHERE id = ?", (edge_id,)
            ).fetchone()
        if not row or not row["auth_token"]:
            return False
        return secrets.compare_digest(
            str(row["auth_token"]), hash_edge_token(str(token))
        )

    def update_node_sync_state(
        self,
        edge_id: str,
        last_hourly_sync: Optional[str] = None,
        unsynced_count: Optional[int] = None,
    ) -> bool:
        """Updates sync metadata reported by an edge node."""
        updates = []
        params: list = []
        if last_hourly_sync is not None:
            updates.append("last_hourly_sync = ?")
            params.append(last_hourly_sync)
        if unsynced_count is not None:
            updates.append("unsynced_count = ?")
            params.append(max(0, int(unsynced_count)))
        if not updates:
            return True
        params.append(edge_id)
        with self._get_conn() as conn:
            cur = conn.execute(
                f"UPDATE edge_nodes SET {', '.join(updates)} WHERE id = ?", params
            )
            return cur.rowcount > 0

    def get_existing_local_ids(self, edge_id: str, local_ids: List[int]) -> set:
        """Returns local violation IDs that were already accepted for this edge."""
        ids = [int(v) for v in local_ids if v is not None]
        if not ids:
            return set()
        placeholders = ",".join("?" for _ in ids)
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""SELECT local_violation_id FROM fleet_violations
                    WHERE edge_id = ? AND local_violation_id IN ({placeholders})""",
                [edge_id, *ids],
            ).fetchall()
            return {row["local_violation_id"] for row in rows}

    def store_batch_incidents(self, edge_id: str, incidents: List[dict]) -> List[int]:
        """Idempotently stores a batch of edge incidents and returns accepted local IDs."""
        node = self.get_node(edge_id)
        edge_name = node["name"] if node else edge_id
        hotel_name = node["hotel_name"] if node else "Unknown Hotel"
        accepted: List[int] = []

        with self._get_conn() as conn:
            for item in incidents:
                local_id = item.get("local_id")
                local_id = int(local_id) if local_id is not None else None
                conn.execute(
                    """
                    INSERT OR IGNORE INTO fleet_violations (
                        edge_id, edge_name, hotel_name, owner_id, camera_id, camera_name,
                        label, category, timestamp, confidence, amfv_ratio,
                        snapshot_filename, snapshot_path, acknowledged,
                        local_violation_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    """,
                    (
                        edge_id,
                        edge_name,
                        hotel_name,
                        str(node.get("owner_id") or DEFAULT_OWNER_ID) if node else DEFAULT_OWNER_ID,
                        item.get("camera_id") or "unknown",
                        item.get("camera_name") or item.get("camera_id") or "unknown",
                        item.get("label") or "violation",
                        item.get("category") or "hygiene",
                        item.get("timestamp")
                        or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        float(item.get("confidence") or 0.0),
                        float(item.get("amfv_ratio") or 0.0),
                        item.get("snapshot_filename"),
                        item.get("snapshot_path"),
                        local_id,
                    ),
                )
                if local_id is not None:
                    accepted.append(local_id)
        return accepted

    def process_heartbeat(
        self,
        edge_id: str,
        telemetry: Optional[dict] = None,
        cameras: Optional[list] = None,
        ip_address: Optional[str] = None,
        unsynced_count: Optional[int] = None,
    ) -> List[dict]:
        """Updates node heartbeat and returns any pending remote commands to dispatch."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self._get_conn() as conn:
            cur = conn.execute("SELECT pending_commands_json FROM edge_nodes WHERE id = ?", (edge_id,))
            row = cur.fetchone()
            if not row:
                return []

            pending_cmds = json.loads(row["pending_commands_json"] or "[]")

            updates = ["status = 'online'", "last_heartbeat = ?"]
            params = [now]

            if telemetry is not None:
                updates.append("telemetry_json = ?")
                params.append(json.dumps(telemetry))

            if cameras is not None:
                updates.append("cameras_json = ?")
                params.append(json.dumps(cameras))

            if ip_address:
                updates.append("ip_address = ?")
                params.append(ip_address)

            if unsynced_count is not None:
                updates.append("unsynced_count = ?")
                params.append(max(0, int(unsynced_count)))

            # Clear pending commands once dispatched
            updates.append("pending_commands_json = '[]'")
            params.append(edge_id)

            sql = f"UPDATE edge_nodes SET {', '.join(updates)} WHERE id = ?"
            conn.execute(sql, params)

            return pending_cmds

    def queue_node_command(self, edge_id: str, command_type: str, payload: dict) -> bool:
        """Queues a remote command for the edge device to pick up on its next heartbeat."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cmd = {
            "id": f"cmd_{int(time.time()*1000)}",
            "type": command_type,
            "payload": payload,
            "created_at": now,
        }

        with self._get_conn() as conn:
            cur = conn.execute("SELECT pending_commands_json FROM edge_nodes WHERE id = ?", (edge_id,))
            row = cur.fetchone()
            if not row:
                return False
            cmds = json.loads(row["pending_commands_json"] or "[]")
            cmds.append(cmd)
            conn.execute(
                "UPDATE edge_nodes SET pending_commands_json = ? WHERE id = ?",
                (json.dumps(cmds), edge_id)
            )
        return True

    def get_node(self, edge_id: str) -> Optional[dict]:
        with self._get_conn() as conn:
            cur = conn.execute("SELECT * FROM edge_nodes WHERE id = ?", (edge_id,))
            row = cur.fetchone()
            if not row:
                return None
            return self._format_node(row)

    def list_nodes(self, owner_id: Optional[str] = None) -> List[dict]:
        query = "SELECT * FROM edge_nodes"
        params: List[Any] = []
        if owner_id:
            query += " WHERE owner_id = ?"
            params.append(owner_id)
        query += " ORDER BY hotel_name ASC, name ASC"
        with self._get_conn() as conn:
            cur = conn.execute(query, params)
            return [self._format_node(r) for r in cur.fetchall()]

    def delete_node(self, edge_id: str) -> bool:
        with self._get_conn() as conn:
            cur = conn.execute("DELETE FROM edge_nodes WHERE id = ?", (edge_id,))
            return cur.rowcount > 0

    def mark_stale_nodes_offline(self, timeout_seconds: int = 30) -> int:
        """Evaluates last heartbeat and updates stale nodes to offline status."""
        with self._get_conn() as conn:
            cur = conn.execute("""
                UPDATE edge_nodes
                SET status = 'offline'
                WHERE status = 'online'
                  AND (strftime('%s', 'now', 'localtime') - strftime('%s', last_heartbeat)) > ?
            """, (timeout_seconds,))
            return cur.rowcount

    def _format_node(self, row: sqlite3.Row) -> dict:
        d = dict(row)
        d.pop("auth_token", None)
        d["cameras"] = json.loads(d.get("cameras_json") or "[]")
        d["telemetry"] = json.loads(d.get("telemetry_json") or "{}")
        d["config"] = json.loads(d.get("config_json") or "{}")
        d["pending_commands"] = json.loads(d.get("pending_commands_json") or "[]")
        return d

    # ── Fleet Violations & Snapshot Operations ───────────────────────────────

    def add_violation(
        self,
        edge_id: str,
        camera_id: str,
        label: str,
        category: str,
        timestamp: str,
        confidence: float,
        amfv_ratio: float,
        snapshot_filename: Optional[str] = None,
        snapshot_path: Optional[str] = None,
        camera_name: Optional[str] = None,
    ) -> int:
        node = self.get_node(edge_id)
        edge_name = node["name"] if node else edge_id
        hotel_name = node["hotel_name"] if node else "Unknown Hotel"
        owner_id = str(node.get("owner_id") or DEFAULT_OWNER_ID) if node else DEFAULT_OWNER_ID

        with self._get_conn() as conn:
            cur = conn.execute("""
                INSERT INTO fleet_violations (
                    edge_id, edge_name, hotel_name, owner_id, camera_id, camera_name,
                    label, category, timestamp, confidence, amfv_ratio,
                    snapshot_filename, snapshot_path, acknowledged
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                edge_id, edge_name, hotel_name, owner_id, camera_id, camera_name or camera_id,
                label, category, timestamp, confidence, amfv_ratio,
                snapshot_filename, snapshot_path
            ))
            return cur.lastrowid

    def list_violations(
        self,
        edge_id: Optional[str] = None,
        hotel_name: Optional[str] = None,
        category: Optional[str] = None,
        label: Optional[str] = None,
        acknowledged: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
        owner_id: Optional[str] = None,
    ) -> List[dict]:
        query = "SELECT * FROM fleet_violations WHERE 1=1"
        params = []

        if owner_id:
            query += " AND owner_id = ?"
            params.append(owner_id)
        if edge_id:
            query += " AND edge_id = ?"
            params.append(edge_id)
        if hotel_name:
            query += " AND hotel_name = ?"
            params.append(hotel_name)
        if category:
            query += " AND category = ?"
            params.append(category)
        if label:
            query += " AND label = ?"
            params.append(label)
        if acknowledged is not None:
            query += " AND acknowledged = ?"
            params.append(1 if acknowledged else 0)

        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self._get_conn() as conn:
            cur = conn.execute(query, params)
            items = []
            for r in cur.fetchall():
                v = dict(r)
                v["acknowledged"] = bool(v.get("acknowledged", 0))
                if v.get("snapshot_filename"):
                    v["snapshot_url"] = f"/snapshots/{v['snapshot_filename']}"
                else:
                    v["snapshot_url"] = None
                items.append(v)
            return items

    def acknowledge_violation(
        self,
        violation_id: int,
        reviewer: str = "Admin",
        owner_id: Optional[str] = None,
    ) -> bool:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        query = """
            UPDATE fleet_violations
            SET acknowledged = 1, reviewed_by = ?, reviewed_at = ?
            WHERE id = ?
        """
        params: List[Any] = [reviewer, now, violation_id]
        if owner_id:
            query += " AND owner_id = ?"
            params.append(owner_id)
        with self._get_conn() as conn:
            cur = conn.execute(query, params)
            return cur.rowcount > 0

    # ── Fleet Analytics & KPIs ───────────────────────────────────────────────

    def get_fleet_kpis(self, owner_id: Optional[str] = None) -> dict:
        node_query = "SELECT * FROM edge_nodes"
        node_params: List[Any] = []
        violation_query = "SELECT * FROM fleet_violations WHERE 1=1"
        violation_filter = ""
        violation_params: List[Any] = []
        if owner_id:
            node_query += " WHERE owner_id = ?"
            node_params.append(owner_id)
            violation_filter += " AND owner_id = ?"
            violation_params.append(owner_id)

        with self._get_conn() as conn:
            cur = conn.execute(
                node_query + " ORDER BY hotel_name ASC, name ASC",
                node_params,
            )
            nodes = [dict(r) for r in cur.fetchall()]
            online_nodes = sum(1 for n in nodes if str(n.get("status") or "").lower() == "online")
            total_nodes = len(nodes)
            total_cameras = 0
            for n in nodes:
                if str(n.get("status") or "").lower() != "online":
                    continue
                cams = json.loads(n.get("cameras_json") or "[]")
                total_cameras += len(cams)

            v_cur = conn.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN category = 'pest' THEN 1 ELSE 0 END) AS pests,
                    SUM(CASE WHEN category = 'hygiene' THEN 1 ELSE 0 END) AS hygiene,
                    SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) AS unreviewed
                FROM fleet_violations
                WHERE 1=1
                """
                + violation_filter,
                violation_params,
            )
            v_stats = v_cur.fetchone()
            violation_stats = {
                "total": v_stats["total"] or 0 if v_stats else 0,
                "pests": v_stats["pests"] or 0 if v_stats else 0,
                "hygiene": v_stats["hygiene"] or 0 if v_stats else 0,
                "unreviewed": v_stats["unreviewed"] or 0 if v_stats else 0,
            }
            risk_cur = conn.execute(
                violation_query
                + violation_filter
                + """
                    AND timestamp >= datetime('now', '-7 days', 'localtime')
                    GROUP BY hotel_name
                    ORDER BY COUNT(*) DESC LIMIT 1
                """,
                violation_params,
            )
            risk_row = risk_cur.fetchone()
            highest_risk_hotel = risk_row["hotel_name"] if risk_row else "All Compliant"

            return {
                "owner_id": owner_id,
                "total_nodes": total_nodes,
                "online_nodes": online_nodes,
                "offline_nodes": max(0, total_nodes - online_nodes),
                "total_cameras": total_cameras,
                "total_violations": violation_stats["total"],
                "pest_violations": violation_stats["pests"],
                "hygiene_violations": violation_stats["hygiene"],
                "unreviewed_violations": violation_stats["unreviewed"],
                "highest_risk_hotel": highest_risk_hotel,
            }

    def get_analytics(self, owner_id: Optional[str] = None) -> dict:
        """Returns 7-day trend, 24h hourly distribution, and branch risk leaderboard."""
        owner_filter = " AND owner_id = ?" if owner_id else ""
        params: List[Any] = [owner_id] if owner_id else []

        with self._get_conn() as conn:
            daily_cur = conn.execute(
                """
                SELECT
                    substr(timestamp, 1, 10) AS day,
                    SUM(CASE WHEN category = 'pest' THEN 1 ELSE 0 END) AS pests,
                    SUM(CASE WHEN category = 'hygiene' THEN 1 ELSE 0 END) AS hygiene,
                    COUNT(*) AS total
                FROM fleet_violations
                WHERE timestamp >= datetime('now', '-7 days', 'localtime')
                """
                + owner_filter
                + " GROUP BY substr(timestamp, 1, 10)"
                + " ORDER BY substr(timestamp, 1, 10) ASC",
                params,
            )
            daily_trend = [dict(r) for r in daily_cur.fetchall()]

            hourly_cur = conn.execute(
                """
                SELECT substr(timestamp, 12, 2) AS hour, COUNT(*) AS count
                FROM fleet_violations
                WHERE 1=1
                """
                + owner_filter
                + " GROUP BY substr(timestamp, 12, 2) ORDER BY substr(timestamp, 12, 2) ASC",
                params,
            )
            hourly_map = {f"{h:02d}": 0 for h in range(24)}
            for row in hourly_cur.fetchall():
                r = dict(row)
                hour_value = str(r.get("hour") or "00")
                if hour_value in hourly_map:
                    hourly_map[hour_value] = r.get("count") or 0
            hourly_distribution = [
                {"hour": f"{h:02d}:00", "count": hourly_map[f"{h:02d}"]}
                for h in range(24)
            ]

            ranking_cur = conn.execute(
                """
                SELECT
                    hotel_name,
                    SUM(CASE WHEN category = 'pest' THEN 1 ELSE 0 END) AS pests,
                    SUM(CASE WHEN category = 'hygiene' THEN 1 ELSE 0 END) AS hygiene,
                    COUNT(*) AS total_violations
                FROM fleet_violations
                WHERE 1=1
                """
                + owner_filter
                + " GROUP BY hotel_name ORDER BY total_violations DESC",
                params,
            )
            branch_ranking = [dict(r) for r in ranking_cur.fetchall()]

            return {
                "owner_id": owner_id,
                "daily_trend": daily_trend,
                "hourly_distribution": hourly_distribution,
                "branch_ranking": branch_ranking,
            }

    # ── Admin Users & Settings ───────────────────────────────────────────────

    def authenticate_admin(self, username: str, password: str) -> Optional[dict]:
        with self._get_conn() as conn:
            cur = conn.execute("SELECT * FROM admin_users WHERE username = ?", (username,))
            row = cur.fetchone()
            if not row:
                return None
            from auth import verify_password
            if verify_password(password, row["password_hash"]):
                return {
                    "id": row["id"],
                    "username": row["username"],
                    "role": row["role"],
                    "owner_id": row["owner_id"] or DEFAULT_OWNER_ID,
                    "is_superadmin": bool(row["is_superadmin"]),
                }
            return None

    def get_setting(self, key: str, default: str = "") -> str:
        with self._get_conn() as conn:
            cur = conn.execute("SELECT value FROM central_settings WHERE key = ?", (key,))
            row = cur.fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO central_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """, (key, value))

    def log_audit(self, actor: str, action: str, target_edge_id: Optional[str] = None, details: str = ""):
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO audit_logs (actor, action, target_edge_id, details) VALUES (?, ?, ?, ?)",
                (actor, action, target_edge_id, details)
            )

