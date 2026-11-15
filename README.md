# SHMS Central Fleet Management Server

The **Central Fleet Management Hub** for the Smart Hotel Monitoring System (SHMS). It aggregates telemetry, live camera streams, AI violation alerts, and high-resolution evidence snapshots from all distributed hotel edge devices into a centralized executive admin portal.

---

## 🚀 Key Features

* **Dedicated React 19 Frontend Dashboard (`frontend/`)**:
  * Built with **React 19**, **Vite 8**, **Tailwind CSS**, **Lucide Icons**, and **Chart.js**.
  * Matches the edge application's high-density **monotonous ash grey and crisp white** industrial design system.
  * Instant tab navigation across **Edge Fleet Nodes**, **Global Evidence Vault**, **Compliance & Analytics**, and **System Settings**.
  * In-app modals for **Live Proxied Stream Playback** and **Remote AMFV Configuration**.
* **Fleet Health & Telemetry Registry**:
  * Real-time online/offline heartbeat tracking for every deployed edge device.
  * Tracks CPU, RAM, active cameras, and FPS across multiple hotel kitchens.
  * Auto-detects offline nodes if heartbeats drop for more than 30 seconds.
* **Master Admin Control Console (`/admin`)**:
  * Master KPI strip: Total Edges Online, Active Cameras, Fleet Violations (Pest vs Hygiene), and Highest Risk Hotel Branch.
* **Live Camera Stream Proxying**:
  * Central supervisors can open any edge camera stream directly in the admin portal (`/api/proxy/stream/{edge_id}/{camera_id}`) without requiring direct network access to edge private LANs.
* **Remote Edge Configuration Push**:
  * Adjust AMFV rolling window size, pest incursion threshold, hygiene compliance threshold, and alert cooldowns remotely from the central UI.
  * Config commands are queued and instantly applied by the edge device on its next heartbeat.
* **Global Snapshot Evidence Vault**:
  * Collects and stores high-resolution violation frames sent by all hotel branches.
  * Filter by Hotel Branch, Edge Node, Violation Category (Pests / PPE), or review status.
  * Full-screen zoom inspection and supervisor review sign-off.
* **Fleet Compliance & Risk Analytics**:
  * 7-day daily incident trend (line chart) and 24-hour peak vulnerability distribution (bar chart).
  * Hotel Branch Risk Ranking leaderboard.
  * 1-click **Export Fleet CSV** for compliance audits.
* **Enterprise Security & Audit Logging**:
  * PBKDF2-HMAC-SHA256 password hashing.
  * Tamper-proof HMAC signed session tokens with secure cookies.
  * Complete audit trail logging every admin configuration push and action.

---

## 🛠️ Quick Start Guide

### 1. Requirements
* Python 3.10+
* Node.js 18+ (for frontend development/builds)
* Backend dependencies:
  ```bash
  pip install fastapi uvicorn jinja2 requests aiofiles
  ```

### 2. Run the Central Server
From inside `D:\Projects\SHMS_central_server`:
```bash
python server.py
```
FastAPI automatically serves the dedicated React application from `frontend/dist/`.

### 3. Open the Central Admin Portal
Navigate your browser to:
```
http://localhost:9000/admin
```
or `http://127.0.0.1:9000/admin`
* **Default Username**: `admin`
* **Default Password**: `admin123`

---

## 💻 Frontend Development (Optional)

To develop with instant Hot Module Replacement (HMR):
```bash
cd D:\Projects\SHMS_central_server\frontend
npm run dev
```
Open `http://localhost:3001` (it automatically proxies API requests to `http://127.0.0.1:9000`).

To re-compile production assets:
```bash
cd D:\Projects\SHMS_central_server\frontend
npm run build
```

---

## 📡 Edge Node Integration Protocol

To connect an edge device (such as the server running in `D:\Projects\Smart-hotel-monitoring-system`) to this central server:

### 1. Automatic Registration (`POST /api/edge/register`)
Upon boot, the edge device sends its identity and camera list:
```json
POST http://<CENTRAL_IP>:9000/api/edge/register
{
  "edge_id": "edge_grand_palace_kitchen",
  "name": "Main Kitchen AI Node",
  "hotel_name": "Grand Palace Hotel",
  "location": "Floor 2 - Prep Counter",
  "api_url": "http://192.168.1.50:8000",
  "cameras": [
    { "id": "cam_29ac09a6", "name": "Kitchen CCTV Feed", "status": "online", "fps": 12.5 }
  ]
}
```

### 2. Periodic Heartbeat (`POST /api/edge/heartbeat`)
Every 5 to 10 seconds, the edge sends telemetry and receives any remote commands queued by the central admin:
```json
POST http://<CENTRAL_IP>:9000/api/edge/heartbeat
{
  "edge_id": "edge_grand_palace_kitchen",
  "telemetry": { "cpu_percent": 18.2, "memory_percent": 42.1 },
  "cameras": [
    { "id": "cam_29ac09a6", "name": "Kitchen CCTV Feed", "status": "online", "fps": 12.5 }
  ]
}
```
**Response**:
```json
{
  "status": "ack",
  "timestamp": "2026-11-13 09:30:00",
  "commands": [
    {
      "id": "cmd_170000000",
      "type": "update_config",
      "payload": { "threshold_pest": 0.25, "threshold_hygiene": 0.45 }
    }
  ]
}
```

### 3. Forward Confirmed Violations (`POST /api/edge/incident`)
When AMFV confirms a violation, the edge uploads the event metadata along with the captured snapshot image:
```
POST http://<CENTRAL_IP>:9000/api/edge/incident
Content-Type: multipart/form-data

edge_id: edge_grand_palace_kitchen
camera_id: cam_29ac09a6
camera_name: Kitchen CCTV Feed
label: no_apron
category: hygiene
timestamp: 2026-11-13 09:28:35
confidence: 0.88
amfv_ratio: 0.60
snapshot: [Binary JPEG Image]
```

---

## 📂 Project Structure

```
SHMS_central_server/
├── server.py               # Main FastAPI server & API endpoints (port 9000)
├── database.py             # SQLite WAL central fleet database
├── config.py               # Central configuration & timeout parameters
├── auth.py                 # PBKDF2/HMAC authentication & session cookies
├── requirements.txt        # Python package dependencies
├── README.md               # Architecture & protocol documentation
├── central_snapshots/      # Stored snapshot evidence uploaded from edge nodes
├── static/
│   ├── css/
│   │   └── admin.css       # Monotonous ash-grey styling & animations
│   └── js/
│       └── admin.js        # Reactive dashboard controller & Chart.js charts
└── templates/
    ├── login.html          # Secure central admin login view
    └── admin.html          # Comprehensive master fleet management portal
```

