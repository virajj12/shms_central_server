/**
 * Central API Client for SHMS Central Fleet Server
 */

const BASE_URL = '';

async function fetchJson(url, options = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

export const api = {
  // Auth
  login: (username, password) => 
    fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => 
    fetchJson('/api/auth/logout', { method: 'POST' }),
  getMe: () => 
    fetchJson('/api/auth/me'),

  // Fleet Overview & Nodes
  getOverview: () => fetchJson('/api/fleet/overview'),
  getOwnerInfo: () => fetchJson('/api/fleet/owner_info'),
  getPendingEnrollments: () => fetchJson('/api/fleet/enrollment/pending'),
  approveEnrollment: (requestId) =>
    fetchJson(`/api/fleet/enrollment/${requestId}/approve`, { method: 'POST' }),
  rejectEnrollment: (requestId, reason = '') =>
    fetchJson(`/api/fleet/enrollment/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  createPairingCode: (payload = {}) =>
    fetchJson('/api/fleet/pairing_codes', { method: 'POST', body: JSON.stringify(payload) }),
  getNodes: () => fetchJson('/api/fleet/nodes'),
  getNode: (id) => fetchJson(`/api/fleet/nodes/${id}`),
  deleteNode: (id) => fetchJson(`/api/fleet/nodes/${id}`, { method: 'DELETE' }),
  pushConfig: (id, payload) => 
    fetchJson(`/api/fleet/nodes/${id}/config`, { method: 'POST', body: JSON.stringify(payload) }),
  sendCommand: (id, type, payload = {}) => 
    fetchJson(`/api/fleet/nodes/${id}/command`, { method: 'POST', body: JSON.stringify({ type, payload }) }),
  requestSnapshot: (id, cameraId = null) =>
    fetchJson(`/api/fleet/nodes/${id}/request_snapshot`, {
      method: 'POST',
      body: JSON.stringify({ camera_id: cameraId }),
    }),
  triggerSync: (id) =>
    fetchJson(`/api/fleet/nodes/${id}/trigger_sync`, { method: 'POST' }),

  // Evidence & Violations
  getViolations: (params = {}) => {
    const q = new URLSearchParams();
    if (params.category && params.category !== 'all') q.append('category', params.category);
    if (params.hotel_name && params.hotel_name !== 'all') q.append('hotel_name', params.hotel_name);
    if (params.edge_id) q.append('edge_id', params.edge_id);
    if (params.limit) q.append('limit', params.limit);
    return fetchJson(`/api/fleet/violations?${q.toString()}`);
  },
  acknowledgeViolation: (id) => 
    fetchJson(`/api/fleet/violations/${id}/acknowledge`, { method: 'POST' }),

  // Analytics & Compliance
  getAnalytics: () => fetchJson('/api/fleet/analytics'),

  // System Settings
  getSettings: () => fetchJson('/api/settings'),
  saveSettings: (payload) => 
    fetchJson('/api/settings', { method: 'POST', body: JSON.stringify(payload) }),
};

