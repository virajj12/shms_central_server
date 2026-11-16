"""
SHMS Central Management Server - FastAPI Application.
Aggregates, monitors, and controls distributed hotel edge vision nodes.
"""

import os
import io
import csv
import json
import asyncio
import time
import base64
import re
import secrets
import uuid
from datetime import datetime, timedelta
import urllib.request
import mimetypes
from typing import Optional, List, Dict, Any
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import (
    FastAPI,
    Request,
    Response,
    HTTPException,
    Depends,
    Body,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

# Ensure proper MIME types on Windows
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

from config import (
    HOST,
    PORT,
    SNAPSHOTS_DIR,
    SESSION_COOKIE_NAME,
    HEARTBEAT_TIMEOUT_SECONDS,
    HEARTBEAT_CHECK_INTERVAL,
    DEFAULT_ADMIN_USER,
    DEFAULT_ADMIN_PASS,
)
from database import CentralDatabase, DEFAULT_OWNER_ID
from auth import (
    create_session_token,
    verify_session_token,
    get_current_admin,
)

db = CentralDatabase()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

PEST_LABELS = {"cockroach", "lizard", "rat"}

MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
MAX_BATCH_SNAPSHOT_BYTES = 25 * 1024 * 1024
MAX_BATCH_INCIDENTS = 500


def _require_owner_node(owner_id: str, edge_id: str):
    """Returns an edge node only when it belongs to the supplied owner."""
    node = db.get_node(edge_id)
    if not node or str(node.get("owner_id") or DEFAULT_OWNER_ID) != str(owner_id):
        return None
    return node


def _safe_component(value: Any, fallback: str = "unknown") -> str:
    """Sanitize a value before using it in a snapshot filename."""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "")).strip("._")
    return (cleaned or fallback)[:80]


def _to_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _category_for_label(label: str) -> str:
    return "pest" if label in PEST_LABELS else "hygiene"


def _ws_command_payload(command: dict) -> dict:
    """Translate a queued HTTP command into the duplex WebSocket protocol."""
    command_type = command.get("type")
    payload = command.get("payload") or {}
    if command_type == "update_config":
        return {
            "action": "update_config",
            "config": payload,
            "command_id": command.get("id"),
        }
    return {
        "action": command_type,
        "payload": payload,
        "command_id": command.get("id"),
    }


def _save_incident_snapshot(
    edge_id: str,
    camera_id: str,
    label: str,
    timestamp: str,
    local_id: Any,
    snapshot_base64: Optional[str],
) -> tuple[Optional[str], Optional[str], int]:
    """Write a base64 snapshot to the central evidence directory."""
    if not snapshot_base64:
        return None, None, 0
    suffix = f"_{local_id}" if local_id is not None else ""
    filename = (
        f"{_safe_component(edge_id, 'edge')}_"
        f"{_safe_component(camera_id, 'cam')}_"
        f"{_safe_component(label, 'violation')}_"
        f"{_safe_component(timestamp.replace(':', '-').replace(' ', '_'), 'ts')}"
        f"{suffix}.jpg"
    )
    destination = SNAPSHOTS_DIR / filename
    try:
        raw = base64.b64decode(snapshot_base64, validate=True)
    except Exception as exc:
        print(f"[Snapshot Error] Invalid base64 for {filename}: {exc}")
        return None, None, 0
    if len(raw) > MAX_SNAPSHOT_BYTES:
        raise ValueError(
            f"Snapshot exceeds {MAX_SNAPSHOT_BYTES // (1024 * 1024)} MB limit"
        )
    try:
        with open(destination, "wb") as handle:
            handle.write(raw)
        return filename, str(destination), len(raw)
    except Exception as exc:
        print(f"[Snapshot Error] Failed to write {filename}: {exc}")
        return None, None, 0


class EdgeConnectionManager:
    """Tracks live duplex WebSocket connections and pending snapshot requests."""

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}
        self._snapshot_waiters: Dict[str, asyncio.Future] = {}

    def is_connected(self, edge_id: str) -> bool:
        return edge_id in self._connections

    async def connect(self, edge_id: str, websocket: WebSocket):
        await websocket.accept()
        previous = self._connections.get(edge_id)
        self._connections[edge_id] = websocket
        if previous is not None and previous is not websocket:
            try:
                await previous.close(code=status.WS_1012_SERVICE_RESTART)
            except Exception:
                pass

    def disconnect(self, edge_id: str, websocket: WebSocket):
        if self._connections.get(edge_id) is websocket:
            self._connections.pop(edge_id, None)

    async def send_json(self, edge_id: str, payload: dict) -> bool:
        websocket = self._connections.get(edge_id)
        if websocket is None:
            return False
        try:
            await websocket.send_json(payload)
            return True
        except Exception:
            self.disconnect(edge_id, websocket)
            return False

    async def request_snapshot(
        self,
        edge_id: str,
        camera_id: Optional[str] = None,
        timeout: float = 5.0,
    ) -> dict:
        websocket = self._connections.get(edge_id)
        if websocket is None:
            raise LookupError("Edge node is not connected over the duplex channel")

        request_id = f"snap_{uuid.uuid4().hex}"
        future = asyncio.get_running_loop().create_future()
        self._snapshot_waiters[request_id] = future
        try:
            try:
                await websocket.send_json(
                    {
                        "action": "capture_snapshot",
                        "request_id": request_id,
                        "camera_id": camera_id,
                    }
                )
            except Exception as exc:
                self.disconnect(edge_id, websocket)
                raise LookupError("Could not reach the edge duplex channel") from exc
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._snapshot_waiters.pop(request_id, None)

    def resolve_snapshot(self, request_id: Optional[str], payload: dict):
        if not request_id:
            return
        future = self._snapshot_waiters.get(request_id)
        if future is not None and not future.done():
            future.set_result(payload)


edge_manager = EdgeConnectionManager()


# ── Lifespan Context Manager (replaces deprecated on_event) ──────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Background task to regularly check edge node heartbeats and detect offline nodes."""
    async def monitor_loop():
        while True:
            try:
                db.mark_stale_nodes_offline(timeout_seconds=HEARTBEAT_TIMEOUT_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[Health Monitor Error] {e}")
            await asyncio.sleep(HEARTBEAT_CHECK_INTERVAL)

    monitor_task = asyncio.create_task(monitor_loop())
    yield
    monitor_task.cancel()


# ── Application Initialization ───────────────────────────────────────────
app = FastAPI(
    title="SHMS Central Fleet Server",
    description="Central Management & Telemetry Hub for Smart Hotel Monitoring Edge Nodes",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for cross-edge dashboard access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/snapshots", StaticFiles(directory=str(SNAPSHOTS_DIR)), name="snapshots")

# Mount dedicated React UI static build assets
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
assets_dir = FRONTEND_DIST / "assets"
assets_dir.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


# ── Web UI Routes ────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
@app.get("/admin", response_class=HTMLResponse)
@app.get("/login", response_class=HTMLResponse)
def serve_dashboard(request: Request):
    """
    Serves the dedicated React 19 SPA single-page dashboard if built,
    or falls back to server-rendered template.
    """
    react_index = FRONTEND_DIST / "index.html"
    if react_index.exists():
        with open(react_index, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())

    # Fallback if not compiled
    token = request.cookies.get(SESSION_COOKIE_NAME)
    user = verify_session_token(token) if token else None
    if not user and request.url.path != "/login":
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    tpl = "admin.html" if user else "login.html"
    return templates.TemplateResponse(request=request, name=tpl, context={"user": user})


# ── Admin Authentication APIs ────────────────────────────────────────────

@app.post("/api/auth/login")
def api_login(payload: Dict[str, str] = Body(...)):
    """Validates admin credentials and sets session cookie."""
    username = payload.get("username", "").strip()
    password = payload.get("password", "").strip()

    admin = db.authenticate_admin(username, password)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    token = create_session_token(
        admin["username"],
        admin["role"],
        owner_id=admin.get("owner_id") or DEFAULT_OWNER_ID,
        is_superadmin=bool(admin.get("is_superadmin")),
    )
    resp = JSONResponse(content={"success": True, "user": admin})
    resp.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,
    )
    db.log_audit(admin["username"], "ADMIN_LOGIN", None, "Successful login to central console")
    return resp


@app.post("/api/auth/logout")
def api_logout():
    """Clears the admin session cookie."""
    resp = JSONResponse(content={"success": True, "message": "Logged out"})
    resp.delete_cookie(SESSION_COOKIE_NAME)
    return resp


@app.get("/api/auth/me")
def api_me(user: dict = Depends(get_current_admin)):
    """Returns current admin user details."""
    return JSONResponse(content={"user": user})


# ── Multi-Tenant Fleet Management APIs ────────────────────────────────────

@app.get("/api/fleet/owner_info")
def get_fleet_owner_info(user: dict = Depends(get_current_admin)):
    """Returns the current owner tenant and its scoped fleet summary."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    owner = db.get_owner(owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    pending = db.list_pending_edges(owner_id)
    nodes = db.list_nodes(owner_id=owner_id)
    return JSONResponse(
        content={
            "success": True,
            "owner_id": owner_id,
            "company_name": owner.get("company_name"),
            "total_kitchens": len(nodes),
            "max_kitchens": owner.get("max_kitchens", 0),
            "onboarding_instruction": (
                "Enter this Owner ID in your Edge Kitchen Settings to connect new cameras."
            ),
            "owner": owner,
            "pending_count": len(pending),
            "pending": pending,
        }
    )


@app.get("/api/fleet/enrollment/pending")
def list_fleet_enrollment_pending(user: dict = Depends(get_current_admin)):
    """Returns enrollment requests scoped to the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    edges = db.list_pending_edges(owner_id)
    return JSONResponse(content={"success": True, "owner_id": owner_id, "edges": edges})


@app.post("/api/fleet/enrollment/{request_id}/approve")
def approve_fleet_enrollment(
    request_id: str,
    payload: Dict[str, Any] = Body(default={}),
    user: dict = Depends(get_current_admin),
):
    """Approves a pending kitchen enrollment for the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = db.get_edge_enrollment(request_id, owner_id=owner_id)
    if not node or str(node.get("enrollment_status") or "pending").lower() != "pending":
        raise HTTPException(status_code=404, detail="Enrollment request not found or already decided")

    auth_token = f"sec_tok_{secrets.token_urlsafe(24)}"
    approved = db.set_edge_enrollment_status(
        request_id=request_id,
        owner_id=owner_id,
        status="approved",
        approved_by=user.get("user") or "owner_admin",
        auth_token=auth_token,
    )
    return JSONResponse(
        content={
            "success": True,
            "owner_id": owner_id,
            "kitchen_id": approved.get("id") if approved else request_id,
            "auth_token": auth_token,
            "status": "approved",
        }
    )


@app.post("/api/fleet/enrollment/{request_id}/reject")
def reject_fleet_enrollment(
    request_id: str,
    payload: Dict[str, Any] = Body(default={}),
    user: dict = Depends(get_current_admin),
):
    """Rejects a pending kitchen enrollment for the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = db.get_edge_enrollment(request_id, owner_id=owner_id)
    if not node or str(node.get("enrollment_status") or "pending").lower() != "pending":
        raise HTTPException(status_code=404, detail="Enrollment request not found or already decided")

    reason = str(payload.get("reason") or "Rejected by owner").strip()
    db.set_edge_enrollment_status(
        request_id=request_id,
        owner_id=owner_id,
        status="rejected",
        approved_by=user.get("user") or "owner_admin",
        rejection_reason=reason,
    )
    return JSONResponse(
        content={
            "success": True,
            "owner_id": owner_id,
            "request_id": request_id,
            "status": "rejected",
            "reason": reason,
        }
    )


@app.post("/api/fleet/pairing_codes")
def create_fleet_pairing_code(
    payload: Dict[str, Any] = Body(default={}),
    user: dict = Depends(get_current_admin),
):
    """Creates an owner-scoped short-lived pairing code for edge onboarding."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    owner = db.get_owner(owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")

    code = str(payload.get("code") or f"{secrets.randbelow(1_000_000):06d}").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Pairing code is required")
    hotel_name = str(payload.get("hotel_name") or owner.get("company_name") or "Hotel")
    kitchen_name = str(payload.get("kitchen_name") or "Kitchen")
    minutes = max(1, int(payload.get("expiry_minutes") or 60))
    expires_at = (datetime.now() + timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    created = db.create_pairing_code(
        owner_id=owner_id,
        code=code,
        hotel_name=hotel_name,
        kitchen_name=kitchen_name,
        expires_at=expires_at,
        created_by=user.get("user") or "owner_admin",
    )
    return JSONResponse(
        content={
            "success": created,
            "code": code,
            "owner_id": owner_id,
            "hotel_name": hotel_name,
            "kitchen_name": kitchen_name,
            "expires_at": expires_at,
        }
    )


# ── Edge Nodes Ingestion & Telemetry APIs ────────────────────────────────

@app.post("/api/edge/request_connection")
def request_edge_connection(
    request: Request,
    payload: Dict[str, Any] = Body(...),
):
    """Multi-tenant duplex registration handshake used by new edge clients."""
    owner_id = str(payload.get("owner_id") or "").strip()
    owner = db.get_owner(owner_id) if owner_id else None
    if not owner or owner["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="Owner ID is invalid or account is suspended",
        )

    hotel_name = str(payload.get("hotel_name", "")).strip()
    kitchen_name = str(payload.get("kitchen_name", "")).strip()
    if not hotel_name or not kitchen_name:
        raise HTTPException(
            status_code=400,
            detail="hotel_name and kitchen_name are required",
        )

    location = str(payload.get("location", "")).strip()
    api_url = str(payload.get("api_url", "")).strip()
    system_info = payload.get("system_info") or {}
    try:
        cameras_count = max(0, int(payload.get("cameras_count") or 0))
    except (TypeError, ValueError):
        cameras_count = 0

    ip_address = request.client.host if request.client else None
    requested_kitchen_id = str(payload.get("kitchen_id") or "").strip()
    requested_token = str(payload.get("auth_token") or "").strip()
    if requested_kitchen_id:
        existing = db.get_node(requested_kitchen_id)
        if existing and str(existing.get("owner_id") or "") != owner_id:
            raise HTTPException(
                status_code=403,
                detail="Kitchen is registered to a different owner",
            )
    if (
        requested_kitchen_id
        and db.edge_has_token(requested_kitchen_id)
        and not db.verify_edge_token(requested_kitchen_id, requested_token)
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid edge credentials for re-enrollment",
        )

    created = db.register_kitchen_connection(
        hotel_name=hotel_name,
        kitchen_name=kitchen_name,
        location=location,
        cameras_count=cameras_count,
        system_info=system_info,
        api_url=api_url,
        ip_address=ip_address,
        kitchen_id=requested_kitchen_id,
        owner_id=owner_id,
        pairing_code=payload.get("pairing_code"),
        hardware_fingerprint=payload.get("hardware_fingerprint"),
    )

    status_value = str(created.get("status") or "approved").lower()
    kitchen_id = created.get("kitchen_id") or requested_kitchen_id or ""
    response_content = {
        "success": status_value == "approved",
        "status": status_value,
        "owner_id": owner_id,
        "kitchen_id": kitchen_id,
        "auth_token": created.get("auth_token"),
        "duplex_endpoint": f"/ws/edge/{kitchen_id}" if status_value == "approved" else None,
        "sync_interval_minutes": 60,
        "node": created.get("node"),
    }
    if status_value == "pending":
        response_content.update(
            {
                "pin": created.get("pin"),
                "request_id": created.get("request_id"),
            }
        )

    if status_value == "approved":
        db.log_audit(
            "SYSTEM",
            "EDGE_CONNECT",
            kitchen_id,
            f"{hotel_name} / {kitchen_name} ({cameras_count} cameras)",
        )
        print(f"[Duplex Registry] Kitchen approved: {kitchen_name} ({hotel_name}) [{kitchen_id}]")
        return JSONResponse(content=response_content)

    print(
        f"[Duplex Registry] Kitchen pending: {kitchen_name} "
        f"({hotel_name}) [{kitchen_id}]"
    )
    return JSONResponse(
        content=response_content,
        status_code=202,
    )


@app.get("/api/edge/connection_status/{request_id}")
def get_edge_connection_status(request_id: str, owner_id: Optional[str] = None):
    """Polls the multi-tenant enrollment state for an edge request."""
    node = db.get_edge_enrollment(request_id, owner_id=owner_id)
    if not node:
        raise HTTPException(status_code=404, detail="Enrollment request not found")
    return JSONResponse(
        content={
            "success": True,
            "status": node.get("enrollment_status") or "pending",
            "kitchen_id": node.get("id"),
            "owner_id": node.get("owner_id"),
            "duplex_endpoint": (
                f"/ws/edge/{node.get('id')}"
                if (node.get("enrollment_status") or "pending") == "approved"
                else None
            ),
            "rejection_reason": node.get("rejection_reason"),
        }
    )


@app.get("/api/edge/enrollment/{request_id}/credentials")
def get_edge_enrollment_credentials(
    request_id: str,
    owner_id: Optional[str] = None,
):
    """Returns an approved edge enrollment credential token."""
    node = db.get_edge_enrollment(request_id, owner_id=owner_id)
    if not node or str(node.get("enrollment_status") or "pending").lower() != "approved":
        raise HTTPException(status_code=404, detail="Enrollment is not approved")
    auth_token = f"sec_tok_{secrets.token_urlsafe(24)}"
    db.set_edge_enrollment_status(
        request_id=request_id,
        owner_id=owner_id or str(node.get("owner_id") or DEFAULT_OWNER_ID),
        status="approved",
        approved_by="edge",
        auth_token=auth_token,
    )
    return JSONResponse(
        content={
            "success": True,
            "status": "approved",
            "kitchen_id": node.get("id"),
            "auth_token": auth_token,
            "owner_id": node.get("owner_id"),
            "duplex_endpoint": f"/ws/edge/{node.get('id')}",
        }
    )


@app.post("/api/edge/register")
def register_edge(payload: Dict[str, Any] = Body(...)):
    """
    Called by an Edge Node when it boots up or restarts.
    Registers or updates node metadata, location, and camera list.
    """
    edge_id = payload.get("edge_id")
    if not edge_id:
        raise HTTPException(status_code=400, detail="Missing required field: edge_id")

    name = payload.get("name", f"Node {edge_id}")
    hotel_name = payload.get("hotel_name", "Grand Hotel")
    location = payload.get("location", "Main Kitchen")
    api_url = payload.get("api_url", "http://127.0.0.1:8000")
    ip_address = payload.get("ip_address")
    cameras = payload.get("cameras", [])
    config = payload.get("config", {})

    node = db.register_or_update_node(
        edge_id=edge_id,
        name=name,
        hotel_name=hotel_name,
        location=location,
        api_url=api_url,
        ip_address=ip_address,
        cameras=cameras,
        config=config,
    )

    print(f"📡 [Fleet Registry] Edge Node Online: {name} ({hotel_name} - {location}) [{edge_id}]")
    db.log_audit("SYSTEM", "EDGE_REGISTER", edge_id, f"Registered at {api_url}")
    return JSONResponse(content={"success": True, "node": node})


@app.post("/api/edge/heartbeat")
def edge_heartbeat(payload: Dict[str, Any] = Body(...)):
    """
    Heartbeat sent by Edge Nodes every 5-10 seconds.
    Updates telemetry and returns any pending remote commands queued by the central admin.
    """
    edge_id = payload.get("edge_id")
    if not edge_id:
        raise HTTPException(status_code=400, detail="Missing edge_id")

    telemetry = payload.get("telemetry", {})
    cameras = payload.get("cameras", None)
    ip_address = payload.get("ip_address", None)

    pending_cmds = db.process_heartbeat(
        edge_id=edge_id,
        telemetry=telemetry,
        cameras=cameras,
        ip_address=ip_address,
        unsynced_count=payload.get("unsynced_incidents"),
    )

    return JSONResponse(content={
        "status": "ack",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "commands": pending_cmds,
    })


@app.websocket("/ws/edge/{edge_id}")
async def edge_duplex(
    websocket: WebSocket,
    edge_id: str,
    token: Optional[str] = None,
):
    """Persistent duplex channel for snapshot requests and remote commands."""
    if not db.verify_edge_token(edge_id, token):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await edge_manager.connect(edge_id, websocket)
    pending = db.process_heartbeat(edge_id=edge_id)
    for command in pending:
        await edge_manager.send_json(edge_id, _ws_command_payload(command))
    print(f"[Duplex] Edge node connected: {edge_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except (TypeError, ValueError):
                continue

            event = message.get("event") or message.get("action")
            if event == "heartbeat":
                pending = db.process_heartbeat(
                    edge_id=edge_id,
                    telemetry=message.get("telemetry"),
                    cameras=message.get("cameras"),
                    unsynced_count=message.get("unsynced_incidents"),
                )
                for command in pending:
                    await edge_manager.send_json(edge_id, _ws_command_payload(command))
            elif event == "snapshot_reply":
                edge_manager.resolve_snapshot(
                    message.get("request_id"), message
                )
            elif event == "ack":
                continue
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[Duplex Error] {edge_id}: {exc}")
    finally:
        edge_manager.disconnect(edge_id, websocket)
        print(f"[Duplex] Edge node disconnected: {edge_id}")


@app.post("/api/edge/batch_sync")
async def receive_batch_sync(payload: Dict[str, Any] = Body(...)):
    """Idempotently ingests a batch of confirmed edge incidents."""
    edge_id = str(payload.get("kitchen_id") or payload.get("edge_id") or "").strip()
    auth_token = str(payload.get("auth_token") or "").strip()
    if not edge_id or not auth_token:
        raise HTTPException(
            status_code=400,
            detail="kitchen_id and auth_token are required",
        )

    if not db.verify_edge_token(edge_id, auth_token):
        raise HTTPException(status_code=401, detail="Invalid edge credentials")

    node = db.get_node(edge_id)
    if not node:
        raise HTTPException(status_code=404, detail="Edge node not found")
    requested_owner_id = str(payload.get("owner_id") or "").strip()
    node_owner_id = str(node.get("owner_id") or DEFAULT_OWNER_ID)
    if requested_owner_id and requested_owner_id != node_owner_id:
        raise HTTPException(status_code=403, detail="Edge owner does not match the authenticated request")

    raw_incidents = payload.get("incidents") or []
    if not isinstance(raw_incidents, list):
        raise HTTPException(status_code=400, detail="incidents must be a list")
    if len(raw_incidents) > MAX_BATCH_INCIDENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Batch limit is {MAX_BATCH_INCIDENTS} incidents",
        )

    candidates = []
    for raw in raw_incidents:
        if not isinstance(raw, dict):
            continue
        local_id = raw.get("local_id")
        try:
            local_id = int(local_id) if local_id is not None else None
        except (TypeError, ValueError):
            local_id = None
        label = str(raw.get("label") or "violation")
        candidates.append(
            {
                "local_id": local_id,
                "camera_id": str(raw.get("camera_id") or "unknown"),
                "camera_name": str(raw.get("camera_name") or "unknown"),
                "label": label,
                "category": _category_for_label(label),
                "timestamp": str(
                    raw.get("timestamp")
                    or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                ),
                "confidence": _to_float(raw.get("confidence")),
                "amfv_ratio": _to_float(raw.get("amfv_ratio")),
                "snapshot_base64": raw.get("snapshot_base64"),
            }
        )

    local_ids = [item["local_id"] for item in candidates if item["local_id"] is not None]
    already_synced = db.get_existing_local_ids(edge_id, local_ids)
    unsynced = [item for item in candidates if item["local_id"] not in already_synced]

    encoded_total = sum(
        len(str(item["snapshot_base64"] or "")) for item in unsynced
    )
    if encoded_total * 3 // 4 > MAX_BATCH_SNAPSHOT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                "Batch snapshots exceed "
                f"{MAX_BATCH_SNAPSHOT_BYTES // (1024 * 1024)} MB limit"
            ),
        )
    for item in unsynced:
        payload_size = len(str(item["snapshot_base64"] or "")) * 3 // 4
        if payload_size > MAX_SNAPSHOT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    "Snapshot exceeds "
                    f"{MAX_SNAPSHOT_BYTES // (1024 * 1024)} MB limit"
                ),
            )

    prepared = []
    for item in unsynced:
        try:
            snapshot_filename, snapshot_path, _ = _save_incident_snapshot(
                edge_id=edge_id,
                camera_id=item["camera_id"],
                label=item["label"],
                timestamp=item["timestamp"],
                local_id=item["local_id"],
                snapshot_base64=item["snapshot_base64"],
            )
        except ValueError as exc:
            raise HTTPException(status_code=413, detail=str(exc))
        prepared.append(
            {
                **item,
                "snapshot_filename": snapshot_filename,
                "snapshot_path": snapshot_path,
            }
        )

    stored_ids = db.store_batch_incidents(edge_id, prepared)
    synced_ids = sorted(set(already_synced) | set(stored_ids))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    remaining = payload.get("remaining_unsynced")
    try:
        remaining_count = int(remaining) if remaining is not None else None
    except (TypeError, ValueError):
        remaining_count = None
    db.update_node_sync_state(
        edge_id,
        last_hourly_sync=now,
        unsynced_count=remaining_count,
    )
    db.log_audit(
        "SYSTEM",
        "EDGE_BATCH_SYNC",
        edge_id,
        f"received={len(candidates)} new={len(stored_ids)} acked={len(synced_ids)}",
    )
    print(
        f"[Fleet Sync] {edge_id}: received {len(candidates)} incidents, "
        f"stored {len(stored_ids)} new, acknowledged {len(synced_ids)}"
    )
    return JSONResponse(
        content={
            "success": True,
            "received": len(candidates),
            "accepted_new": len(stored_ids),
            "already_synced": len(already_synced),
            "synced_local_ids": synced_ids,
            "last_hourly_sync": now,
        }
    )


@app.post("/api/edge/incident")
async def receive_incident(request: Request):
    """
    Receives confirmed AMFV incident and uploaded evidence snapshot from an Edge Node.
    Zero dependency on python-multipart: accepts clean JSON with base64 snapshot or standard form data.
    """
    content_type = request.headers.get("content-type", "")
    snapshot_filename = None
    saved_path = None

    if "application/json" in content_type:
        payload = await request.json()
        edge_id = payload.get("edge_id")
        camera_id = payload.get("camera_id")
        label = payload.get("label", "violation")
        category = payload.get("category", "hygiene")
        timestamp = payload.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        confidence = float(payload.get("confidence", 0.0))
        amfv_ratio = float(payload.get("amfv_ratio", 0.0))
        camera_name = payload.get("camera_name", camera_id)
        b64_snap = payload.get("snapshot_base64")

        if b64_snap:
            try:
                snapshot_filename, saved_path, _ = _save_incident_snapshot(
                    edge_id=str(edge_id or "edge"),
                    camera_id=str(camera_id or "cam"),
                    label=str(label),
                    timestamp=str(timestamp),
                    local_id=None,
                    snapshot_base64=b64_snap,
                )
            except ValueError as exc:
                raise HTTPException(status_code=413, detail=str(exc))
    else:
        # Fallback for multipart / form-data if available
        try:
            form = await request.form()
            edge_id = form.get("edge_id")
            camera_id = form.get("camera_id")
            label = form.get("label", "violation")
            category = form.get("category", "hygiene")
            timestamp = form.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            confidence = float(form.get("confidence", 0.0))
            amfv_ratio = float(form.get("amfv_ratio", 0.0))
            camera_name = form.get("camera_name", camera_id)
            snapshot = form.get("snapshot")

            if snapshot and hasattr(snapshot, "read"):
                ext = Path(getattr(snapshot, "filename", "snap.jpg")).suffix or ".jpg"
                contents = await snapshot.read()
                if len(contents) > MAX_SNAPSHOT_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "Snapshot exceeds "
                            f"{MAX_SNAPSHOT_BYTES // (1024 * 1024)} MB limit"
                        ),
                    )
                safe_ts = timestamp.replace(":", "-").replace(" ", "_")
                snapshot_filename = (
                    f"{_safe_component(str(edge_id or 'edge'), 'edge')}_"
                    f"{_safe_component(str(camera_id or 'cam'), 'cam')}_"
                    f"{_safe_component(str(label), 'violation')}_"
                    f"{_safe_component(safe_ts, 'ts')}{ext}"
                )
                destination = SNAPSHOTS_DIR / snapshot_filename
                with open(destination, "wb") as f:
                    f.write(contents)
                saved_path = str(destination)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse incident request: {e}")

    if not edge_id or not camera_id:
        raise HTTPException(status_code=400, detail="Missing required fields: edge_id and camera_id")

    violation_id = db.add_violation(
        edge_id=edge_id,
        camera_id=camera_id,
        label=label,
        category=category,
        timestamp=timestamp,
        confidence=confidence,
        amfv_ratio=amfv_ratio,
        snapshot_filename=snapshot_filename,
        snapshot_path=saved_path,
        camera_name=camera_name,
    )

    print(f"🚨 [Fleet Alert] {label.upper()} confirmed on {edge_id} ({camera_name}) @ {timestamp}")
    return JSONResponse(content={
        "success": True,
        "violation_id": violation_id,
        "snapshot_url": f"/snapshots/{snapshot_filename}" if snapshot_filename else None,
    })


# ── Fleet Management & Operations APIs (Protected) ───────────────────────

@app.get("/api/fleet/overview")
def get_fleet_overview(user: dict = Depends(get_current_admin)):
    """Returns top-level fleet KPIs for the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    return JSONResponse(content=db.get_fleet_kpis(owner_id))


@app.get("/api/fleet/nodes")
def get_fleet_nodes(user: dict = Depends(get_current_admin)):
    """Returns all registered edge nodes and live status for the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    nodes = db.list_nodes(owner_id)
    for node in nodes:
        node["duplex_connected"] = edge_manager.is_connected(node["id"])
    return JSONResponse(content=nodes)


@app.get("/api/fleet/nodes/{edge_id}")
def get_fleet_node_detail(edge_id: str, user: dict = Depends(get_current_admin)):
    """Returns detailed status and telemetry for a specific edge node."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = _require_owner_node(owner_id, edge_id)
    if not node:
        raise HTTPException(status_code=404, detail="Edge node not found")
    node["duplex_connected"] = edge_manager.is_connected(edge_id)
    return JSONResponse(content=node)


@app.delete("/api/fleet/nodes/{edge_id}")
def delete_fleet_node(edge_id: str, user: dict = Depends(get_current_admin)):
    """Removes an edge node from the current owner's fleet registry."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    if _require_owner_node(owner_id, edge_id) is None:
        raise HTTPException(status_code=404, detail="Edge node not found")
    success = db.delete_node(edge_id)
    if not success:
        raise HTTPException(status_code=404, detail="Edge node not found")
    db.log_audit(user["user"], "DELETE_NODE", edge_id, "Removed edge node from central registry")
    return JSONResponse(content={"success": True, "message": f"Node {edge_id} removed."})


@app.post("/api/fleet/nodes/{edge_id}/config")
async def push_node_config(
    edge_id: str,
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(get_current_admin),
):
    """
    Pushes remote configuration changes (e.g. AMFV window, thresholds, cooldown)
    to a specific edge node over the duplex channel, with HTTP-heartbeat fallback.
    """
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = _require_owner_node(owner_id, edge_id)
    if not node:
        raise HTTPException(status_code=404, detail="Edge node not found")

    delivered = await edge_manager.send_json(
        edge_id,
        {"action": "update_config", "config": payload},
    )
    success = delivered
    if not delivered:
        success = db.queue_node_command(
            edge_id=edge_id,
            command_type="update_config",
            payload=payload,
        )

    db.log_audit(
        user["user"],
        "UPDATE_CONFIG",
        edge_id,
        f"{'Pushed' if delivered else 'Queued'} config update: {json.dumps(payload)}",
    )

    return JSONResponse(content={
        "success": success,
        "delivered": delivered,
        "message": (
            f"Configuration pushed to {node['name']} over the duplex channel."
            if delivered
            else f"Node offline. Configuration queued for {node['name']} and will apply on reconnect."
        ),
    })


@app.post("/api/fleet/nodes/{edge_id}/request_snapshot")
async def request_live_snapshot(
    edge_id: str,
    payload: Dict[str, Any] = Body(default={}),
    user: dict = Depends(get_current_admin),
):
    """Requests an on-demand JPEG snapshot from a connected edge camera."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = _require_owner_node(owner_id, edge_id)
    if not node:
        raise HTTPException(status_code=404, detail="Edge node not found")
    if not edge_manager.is_connected(edge_id):
        raise HTTPException(
            status_code=503,
            detail="Edge node is not connected over the duplex channel",
        )

    camera_id = payload.get("camera_id") if payload else None
    try:
        reply = await edge_manager.request_snapshot(
            edge_id,
            camera_id=camera_id,
            timeout=5.0,
        )
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Edge node did not return a snapshot within 5 seconds",
        )

    if reply.get("error"):
        raise HTTPException(status_code=502, detail=reply["error"])
    if not reply.get("image_base64"):
        raise HTTPException(status_code=502, detail="Edge returned an empty snapshot")

    db.log_audit(
        user["user"],
        "REQUEST_SNAPSHOT",
        edge_id,
        f"camera={reply.get('camera_id') or camera_id or 'auto'}",
    )
    return JSONResponse(
        content={
            "success": True,
            "edge_id": edge_id,
            "camera_id": reply.get("camera_id"),
            "camera_name": reply.get("camera_name"),
            "timestamp": reply.get("timestamp"),
            "image_base64": reply["image_base64"],
        }
    )


@app.post("/api/fleet/nodes/{edge_id}/trigger_sync")
async def trigger_node_sync(
    edge_id: str,
    user: dict = Depends(get_current_admin),
):
    """Asks a connected edge node to run an immediate batch sync."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = _require_owner_node(owner_id, edge_id)
    if not node:
        raise HTTPException(status_code=404, detail="Edge node not found")

    delivered = await edge_manager.send_json(edge_id, {"action": "trigger_sync"})
    if not delivered:
        raise HTTPException(
            status_code=503,
            detail="Edge node is not connected over the duplex channel",
        )

    db.log_audit(user["user"], "TRIGGER_SYNC", edge_id, "Requested immediate batch sync")
    return JSONResponse(
        content={
            "success": True,
            "message": f"Sync requested for {node['name']}. Incidents should arrive shortly.",
        }
    )


@app.post("/api/fleet/nodes/{edge_id}/command")
def send_node_command(
    edge_id: str,
    payload: Dict[str, Any] = Body(...),
    user: dict = Depends(get_current_admin),
):
    """
    Sends operational command to an edge node (e.g. restart camera stream, clear logs).
    """
    cmd_type = payload.get("type", "ping")
    cmd_payload = payload.get("payload", {})
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    if _require_owner_node(owner_id, edge_id) is None:
        raise HTTPException(status_code=404, detail="Edge node not found")

    queued = db.queue_node_command(edge_id, cmd_type, cmd_payload)
    db.log_audit(user["user"], f"CMD_{cmd_type.upper()}", edge_id, json.dumps(cmd_payload))

    return JSONResponse(content={"success": queued, "command": cmd_type})


@app.get("/api/fleet/violations")
def get_fleet_violations(
    edge_id: Optional[str] = None,
    hotel_name: Optional[str] = None,
    category: Optional[str] = None,
    label: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(get_current_admin),
):
    """Lists fleet-wide violations scoped to the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    items = db.list_violations(
        edge_id=edge_id,
        hotel_name=hotel_name,
        category=category,
        label=label,
        acknowledged=acknowledged,
        limit=limit,
        offset=offset,
        owner_id=owner_id,
    )
    return JSONResponse(content=items)


@app.post("/api/fleet/violations/{violation_id}/acknowledge")
def acknowledge_violation(
    violation_id: int,
    user: dict = Depends(get_current_admin),
):
    """Marks a violation as reviewed and acknowledged by the central supervisor."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    success = db.acknowledge_violation(
        violation_id,
        reviewer=user["user"],
        owner_id=owner_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Violation record not found")
    return JSONResponse(content={"success": True, "id": violation_id})


@app.get("/api/fleet/analytics")
def get_fleet_analytics(user: dict = Depends(get_current_admin)):
    """Returns fleet aggregated analytics for the current owner."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    return JSONResponse(content=db.get_analytics(owner_id))


@app.get("/api/fleet/export/csv")
def export_fleet_csv(user: dict = Depends(get_current_admin)):
    """Exports the current owner's fleet violations to a streaming CSV spreadsheet."""
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    items = db.list_violations(limit=5000, owner_id=owner_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Incident ID", "Hotel Branch", "Edge Node", "Camera ID", "Camera Name",
        "Violation", "Category", "Confidence (%)", "AMFV Ratio", "Timestamp",
        "Snapshot File", "Reviewed", "Reviewed By", "Reviewed At"
    ])

    for v in items:
        writer.writerow([
            v["id"],
            v.get("hotel_name", "N/A"),
            v.get("edge_name", v.get("edge_id")),
            v.get("camera_id"),
            v.get("camera_name", "N/A"),
            v.get("label"),
            v.get("category"),
            f"{int(v.get('confidence', 0) * 100)}%",
            f"{int(v.get('amfv_ratio', 0) * 100)}%",
            v.get("timestamp"),
            v.get("snapshot_filename", "N/A"),
            "Yes" if v.get("acknowledged") else "No",
            v.get("reviewed_by") or "",
            v.get("reviewed_at") or "",
        ])

    output.seek(0)
    filename = f"fleet_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/fleet/export/pdf")
def export_compliance_pdf(user: dict = Depends(get_current_admin)):
    """Generates and downloads an executive 1-page PDF compliance certificate."""
    try:
        from utils.pdf_report import generate_compliance_pdf
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"PDF report module unavailable: {e}")

    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    kpis = db.get_fleet_kpis(owner_id)
    nodes = db.list_nodes(owner_id)

    stations = []
    for node in nodes:
        cams = node.get("cameras") or []
        edge_violations = db.list_violations(edge_id=node["id"], limit=500)
        p_count = sum(1 for v in edge_violations if v.get("category") == "pest")
        h_count = sum(1 for v in edge_violations if v.get("category") == "hygiene")
        stations.append({
            "station": f"{node.get('hotel_name', 'Branch')} - {node.get('name')}",
            "cameras": len(cams),
            "pests": p_count,
            "hygiene": h_count,
            "status": "Compliant" if p_count == 0 and h_count < 5 else ("Caution" if p_count <= 1 else "Non-Compliant"),
        })

    total_violations = kpis.get("total_violations", 0)
    pest_count = kpis.get("pest_violations", 0)
    hygiene_count = kpis.get("hygiene_violations", 0)
    total_active_cams = max(1, kpis.get("active_cameras", 1))
    score = max(50.0, min(100.0, 100.0 - (pest_count * 5.0 + hygiene_count * 1.5) / total_active_cams))

    report_id = f"AUDIT-{datetime.now().strftime('%Y%m%d')}-{len(nodes):03d}"
    report_data = {
        "report_id": report_id,
        "hotel_name": "Fleet Commercial Kitchen Surveillance",
        "location": "Central Fleet Aggregation",
        "audit_period": f"Last 7 Days (Ending {datetime.now().strftime('%b %d, %Y')})",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_camera_hours": round(total_active_cams * 24.0 * 7.0, 1),
        "total_violations": total_violations,
        "pest_incursions": pest_count,
        "hygiene_breaches": hygiene_count,
        "compliance_score": round(score, 1),
        "stations_breakdown": stations[:8],
        "inspector_notes": "Continuous AMFV temporal filtering active. Verified by Central Surveillance Control Plane.",
    }

    out_file = os.path.join(SNAPSHOTS_DIR, f"compliance_cert_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf")
    pdf_path = generate_compliance_pdf(report_data, output_path=out_file)

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"Food_Safety_Audit_Certificate_{datetime.now().strftime('%Y%m%d')}.pdf",
    )


# ── Edge Live Camera Proxy Stream ────────────────────────────────────────

@app.get("/api/proxy/stream/{edge_id}/{camera_id}")
async def proxy_edge_stream(edge_id: str, camera_id: str, user: dict = Depends(get_current_admin)):
    """
    Proxies live MJPEG video stream from a remote Edge Node directly to the central admin browser.
    Allows centralized live CCTV viewing across different networks.
    """
    owner_id = user.get("owner_id") or DEFAULT_OWNER_ID
    node = _require_owner_node(owner_id, edge_id)
    if not node:
        raise HTTPException(status_code=404, detail="Edge node not found")

    edge_api_url = node["api_url"].rstrip("/")
    stream_url = f"{edge_api_url}/video_feed/{camera_id}"

    async def stream_generator():
        stream_resp = None
        try:
            req = urllib.request.Request(
                stream_url,
                headers={"User-Agent": "SHMS-Central-Proxy/2.0"},
            )
            stream_resp = await asyncio.to_thread(
                urllib.request.urlopen, req, timeout=10
            )
            while True:
                chunk = await asyncio.to_thread(stream_resp.read, 4096)
                if not chunk:
                    break
                yield chunk
        except Exception as e:
            print(f"[Proxy Stream Error for {edge_id}/{camera_id}] {e}")
        finally:
            if stream_resp is not None:
                try:
                    await asyncio.to_thread(stream_resp.close)
                except Exception:
                    pass

    return StreamingResponse(
        stream_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ── Central System Settings ──────────────────────────────────────────────

@app.get("/api/settings")
def get_settings(user: dict = Depends(get_current_admin)):
    return JSONResponse(content={
        "central_email": db.get_setting("central_email", "central-alerts@smart-hotel.com"),
        "webhook_url": db.get_setting("webhook_url", ""),
        "heartbeat_timeout": int(db.get_setting("heartbeat_timeout", "30")),
    })


@app.post("/api/settings")
def update_settings(payload: Dict[str, Any] = Body(...), user: dict = Depends(get_current_admin)):
    for k, v in payload.items():
        db.set_setting(k, str(v))
    db.log_audit(user["user"], "UPDATE_SETTINGS", None, json.dumps(payload))
    return JSONResponse(content={"success": True, "message": "Settings updated"})


# ── CLI Entrypoint ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print(f"================================================================")
    print(f"🏨 SHMS Central Fleet Server is running!")
    print(f"👉 Local Access         : http://localhost:{PORT}/admin")
    print(f"👉 IP Access            : http://127.0.0.1:{PORT}/admin")
    print(f"🔑 Default Credentials  : user={DEFAULT_ADMIN_USER}  pass={DEFAULT_ADMIN_PASS}")
    print(f"================================================================")
    uvicorn.run("server:app", host=HOST, port=PORT, reload=True)

