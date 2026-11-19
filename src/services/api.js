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
  requestPasswordReset: (identifier) =>
    fetchJson('/api/auth/forgot_password/request', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),
  verifyPasswordReset: (ownerId, otp, newPassword) =>
    fetchJson('/api/auth/forgot_password/verify', {
      method: 'POST',
      body: JSON.stringify({ owner_id: ownerId, otp, new_password: newPassword }),
    }),
  testSmtpEmail: (testEmail = '') =>
    fetchJson('/api/admin/email/test', {
      method: 'POST',
      body: JSON.stringify({ test_email: testEmail }),
    }),

  // Public Vanity Hotel Lookup
  getPublicHotel: (slug) => fetchJson(`/api/public/hotel/${slug}`),

  // Multi-Tenant Hotels Management (Superadmin Only)
  getHotels: () => fetchJson('/api/admin/hotels'),
  createHotel: (payload) =>
    fetchJson('/api/admin/hotels', { method: 'POST', body: JSON.stringify(payload) }),
  updateHotel: (id, payload) =>
    fetchJson(`/api/admin/hotels/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  resetHotelPassword: (id, newPassword) =>
    fetchJson(`/api/admin/hotels/${id}/reset_password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    }),
  deleteHotel: (id) =>
    fetchJson(`/api/admin/hotels/${id}`, { method: 'DELETE' }),

  // Fleet Overview & Nodes
  getOverview: (ownerId = null) =>
    fetchJson(`/api/fleet/overview${ownerId && ownerId !== 'all' ? `?owner_id=${encodeURIComponent(ownerId)}` : ''}`),
  getOwnerInfo: (ownerId = null) =>
    fetchJson(`/api/fleet/owner_info${ownerId && ownerId !== 'all' ? `?owner_id=${encodeURIComponent(ownerId)}` : ''}`),
  getPendingEnrollments: (ownerId = null) =>
    fetchJson(`/api/fleet/enrollment/pending${ownerId && ownerId !== 'all' ? `?owner_id=${encodeURIComponent(ownerId)}` : ''}`),
  approveEnrollment: (requestId) =>
    fetchJson(`/api/fleet/enrollment/${requestId}/approve`, { method: 'POST' }),
  rejectEnrollment: (requestId, reason = '') =>
    fetchJson(`/api/fleet/enrollment/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  createPairingCode: (payload = {}) =>
    fetchJson('/api/fleet/pairing_codes', { method: 'POST', body: JSON.stringify(payload) }),
  getNodes: (ownerId = null) =>
    fetchJson(`/api/fleet/nodes${ownerId && ownerId !== 'all' ? `?owner_id=${encodeURIComponent(ownerId)}` : ''}`),
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
    if (params.owner_id && params.owner_id !== 'all') q.append('owner_id', params.owner_id);
    if (params.category && params.category !== 'all') q.append('category', params.category);
    if (params.hotel_name && params.hotel_name !== 'all') q.append('hotel_name', params.hotel_name);
    if (params.edge_id) q.append('edge_id', params.edge_id);
    if (params.limit) q.append('limit', params.limit);
    return fetchJson(`/api/fleet/violations?${q.toString()}`);
  },
  acknowledgeViolation: (id) => 
    fetchJson(`/api/fleet/violations/${id}/acknowledge`, { method: 'POST' }),

  // Analytics & Compliance
  getAnalytics: (ownerId = null) =>
    fetchJson(`/api/fleet/analytics${ownerId && ownerId !== 'all' ? `?owner_id=${encodeURIComponent(ownerId)}` : ''}`),

  // System Settings
  getSettings: () => fetchJson('/api/settings'),
  saveSettings: (payload) => 
    fetchJson('/api/settings', { method: 'POST', body: JSON.stringify(payload) }),
};

