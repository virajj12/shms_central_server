import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { db, DEFAULT_OWNER_ID } from '../lib/db.js';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  requireAdmin,
  verifySessionToken,
} from '../lib/auth.js';

const app = express();

// Express Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// ── Authentication Endpoints ─────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ detail: 'Username and password are required' });
    }

    const admin = await db.authenticateAdmin(username, password);
    if (!admin) {
      return res.status(401).json({ detail: 'Invalid username or password' });
    }

    const token = createSessionToken(admin);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    db.logAudit(admin.username, 'LOGIN', null, 'Admin successfully logged in');
    return res.json({
      success: true,
      user: admin.username,
      role: admin.role,
      owner_id: admin.owner_id,
      is_superadmin: admin.is_superadmin,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ detail: err.message || 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME] ||
    (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

  if (!token) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }

  const user = verifySessionToken(token);
  if (!user) {
    return res.status(401).json({ detail: 'Session expired' });
  }

  return res.json({
    user: user.sub,
    role: user.role,
    owner_id: user.owner_id,
    is_superadmin: user.is_superadmin,
  });
});

// ── Fleet Overview & KPIs ───────────────────────────────────────────────────

app.get('/api/fleet/overview', requireAdmin, async (req, res) => {
  try {
    const kpis = await db.getFleetKpis(req.user.owner_id);
    return res.json(kpis);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/fleet/owner_info', requireAdmin, async (req, res) => {
  try {
    const owner = await db.getOwner(req.user.owner_id);
    return res.json(owner || { id: req.user.owner_id, company_name: 'Hotel Management' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Enrollment & Pairing ────────────────────────────────────────────────────

app.get('/api/fleet/enrollment/pending', requireAdmin, async (req, res) => {
  try {
    const pending = await db.listPendingEnrollments(req.user.owner_id);
    return res.json({ success: true, edges: pending });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/enrollment/:requestId/approve', requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await db.setEdgeEnrollmentStatus(requestId, 'approved', req.user.sub);
    db.logAudit(req.user.sub, 'APPROVE_ENROLLMENT', result.id, `Approved request ${requestId}`);
    return res.json({ success: true, node: result });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/enrollment/:requestId/reject', requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason = 'Rejected by administrator' } = req.body || {};
    const result = await db.setEdgeEnrollmentStatus(requestId, 'rejected', req.user.sub, reason);
    db.logAudit(req.user.sub, 'REJECT_ENROLLMENT', result.id, `Reason: ${reason}`);
    return res.json({ success: true, node: result });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/pairing_codes', requireAdmin, async (req, res) => {
  try {
    const { hotel_name, kitchen_name, ttl_minutes = 60 } = req.body || {};
    if (!hotel_name) {
      return res.status(400).json({ detail: 'hotel_name is required' });
    }

    const pairing = await db.createPairingCode(
      req.user.owner_id,
      hotel_name,
      kitchen_name || 'Main Kitchen',
      req.user.sub,
      ttl_minutes
    );

    db.logAudit(req.user.sub, 'CREATE_PAIRING_CODE', null, `Created PIN ${pairing.code} for ${hotel_name}`);
    return res.json(pairing);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Fleet Nodes & Remote Commands ───────────────────────────────────────────

app.get('/api/fleet/nodes', requireAdmin, async (req, res) => {
  try {
    const nodes = await db.listNodes(req.user.owner_id);
    return res.json(nodes);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/fleet/nodes/:id', requireAdmin, async (req, res) => {
  try {
    const node = await db.getNode(req.params.id);
    if (!node) return res.status(404).json({ detail: 'Edge node not found' });
    return res.json(node);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/fleet/nodes/:id', requireAdmin, async (req, res) => {
  try {
    const success = await db.deleteNode(req.params.id);
    db.logAudit(req.user.sub, 'DELETE_NODE', req.params.id, 'Edge node deleted');
    return res.json({ success });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/nodes/:id/config', requireAdmin, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const configPayload = req.body || {};
    const command = await db.queueNodeCommand(edgeId, 'update_config', configPayload);
    db.logAudit(req.user.sub, 'UPDATE_CONFIG', edgeId, JSON.stringify(configPayload));
    return res.json({ success: true, command_id: command.id });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/nodes/:id/command', requireAdmin, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const { type, payload = {} } = req.body || {};
    const command = await db.queueNodeCommand(edgeId, type || 'custom_command', payload);
    return res.json({ success: true, command_id: command.id });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/nodes/:id/trigger_sync', requireAdmin, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const command = await db.queueNodeCommand(edgeId, 'trigger_sync', {});
    return res.json({ success: true, message: 'Sync command queued for edge node' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

/**
 * On-demand live snapshot request
 * Queues 'capture_snapshot' command in edge_commands and awaits the reply (up to 7 seconds).
 */
app.post('/api/fleet/nodes/:id/request_snapshot', requireAdmin, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const { camera_id = null } = req.body || {};

    const node = await db.getNode(edgeId);
    if (!node) return res.status(404).json({ detail: 'Edge node not found' });

    // Queue command for edge
    const command = await db.queueNodeCommand(edgeId, 'capture_snapshot', { camera_id });
    const commandId = command.id;

    // Await completion (poll DB every 500ms for up to 8 seconds)
    const startTime = Date.now();
    let completed = false;
    let finalCommand = null;

    while (Date.now() - startTime < 8000) {
      await new Promise((r) => setTimeout(r, 500));
      finalCommand = await db.getCommand(commandId);
      if (finalCommand && (finalCommand.status === 'completed' || finalCommand.status === 'failed')) {
        completed = true;
        break;
      }
    }

    if (!completed || !finalCommand) {
      return res.status(504).json({
        detail: 'Edge appliance did not respond with snapshot within 8 seconds. Node may be offline or polling delayed.',
      });
    }

    if (finalCommand.status === 'failed') {
      return res.status(502).json({ detail: finalCommand.error_message || 'Snapshot capture failed' });
    }

    db.logAudit(req.user.sub, 'REQUEST_SNAPSHOT', edgeId, `Camera: ${camera_id || 'auto'}`);

    return res.json({
      success: true,
      edge_id: edgeId,
      camera_id: camera_id,
      image_base64: finalCommand.result_b64 || '',
      snapshot_url: finalCommand.result_url || '',
      captured_at: finalCommand.completed_at,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Violations & Analytics ──────────────────────────────────────────────────

app.get('/api/fleet/violations', requireAdmin, async (req, res) => {
  try {
    const params = {
      owner_id: req.user.owner_id,
      category: req.query.category,
      hotel_name: req.query.hotel_name,
      edge_id: req.query.edge_id,
      acknowledged: req.query.acknowledged !== undefined ? req.query.acknowledged === 'true' : null,
      limit: parseInt(req.query.limit || '100', 10),
    };
    const violations = await db.listViolations(params);
    return res.json(violations);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/violations/:id/acknowledge', requireAdmin, async (req, res) => {
  try {
    const success = await db.acknowledgeViolation(req.params.id, req.user.sub);
    return res.json({ success });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/fleet/analytics', requireAdmin, async (req, res) => {
  try {
    const data = await db.getAnalytics(req.user.owner_id);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await db.getSettings();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/settings', requireAdmin, async (req, res) => {
  try {
    await db.setSettings(req.body || {});
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Edge Appliance APIs (Called by local hotel computer) ────────────────────

/**
 * 1. Initial pairing/enrollment from Edge Node
 */
app.post(['/api/edge/pair', '/api/edge/request_connection', '/api/fleet/register'], async (req, res) => {
  try {
    const result = await db.registerKitchenConnection(req.body || {});
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Pass Supabase upload config so the edge can upload images directly
    return res.json({
      ...result,
      status: result.enrollment_status,
      auth_token: result.token,
      pin: req.body?.pairing_pin || '',
      supabase_url: process.env.SUPABASE_URL || '',
      supabase_anon_key:
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        '',
      supabase_bucket: process.env.SUPABASE_BUCKET || 'evidence-snapshots',
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/edge/connection_status/:requestId', async (req, res) => {
  try {
    const node = await db.getEdgeEnrollment(req.params.requestId, req.query.owner_id);
    if (!node) {
      return res.status(404).json({ detail: 'Enrollment request not found' });
    }
    return res.json({
      success: true,
      status: node.enrollment_status || 'pending',
      kitchen_id: node.id,
      owner_id: node.owner_id,
      rejection_reason: node.rejection_reason,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/edge/enrollment/:requestId/credentials', async (req, res) => {
  try {
    const node = await db.getEdgeEnrollment(req.params.requestId);
    if (!node || node.enrollment_status !== 'approved') {
      return res.status(404).json({ detail: 'Enrollment is not approved' });
    }
    const updated = await db.setEdgeEnrollmentStatus(req.params.requestId, 'approved', 'edge');
    return res.json({
      success: true,
      status: 'approved',
      kitchen_id: node.id,
      auth_token: updated.plain_token,
      supabase_url: process.env.SUPABASE_URL || '',
      supabase_anon_key:
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        '',
      supabase_bucket: process.env.SUPABASE_BUCKET || 'evidence-snapshots',
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

/**
 * 2. Edge 3-second Heartbeat & Command Polling
 */
app.post('/api/edge/poll', async (req, res) => {
  try {
    const { edge_id, auth_token, telemetry, cameras, unsynced_incidents } = req.body || {};
    if (!edge_id) {
      return res.status(400).json({ detail: 'edge_id is required' });
    }

    // Verify auth token if enrolled
    const isValid = await db.verifyEdgeToken(edge_id, auth_token);
    if (!isValid) {
      return res.status(403).json({ detail: 'Invalid or missing edge authentication token' });
    }

    const commands = await db.processHeartbeat(
      edge_id,
      telemetry || {},
      cameras || [],
      unsynced_incidents || 0
    );

    return res.json({
      success: true,
      commands: commands.map((c) => ({
        id: c.id,
        command: c.command,
        payload: c.payload,
        camera_id: c.payload?.camera_id,
        created_at: c.created_at,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// Backward-compatibility alias for heartbeat
app.post('/api/edge/heartbeat', async (req, res) => {
  try {
    const { edge_id, telemetry, cameras, unsynced_incidents } = req.body || {};
    const commands = await db.processHeartbeat(edge_id, telemetry, cameras, unsynced_incidents);
    return res.json({ success: true, commands });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

/**
 * 3. Command Reply from Edge (e.g. Live Snapshot base64 or execution status)
 */
app.post('/api/edge/command_reply', async (req, res) => {
  try {
    const { command_id, status = 'completed', image_base64, snapshot_url, error_message } = req.body || {};
    if (!command_id) {
      return res.status(400).json({ detail: 'command_id is required' });
    }

    // Update command in DB so request_snapshot endpoint returns immediately
    await db.replyNodeCommand(
      command_id,
      status,
      image_base64 || null,
      snapshot_url || null,
      error_message || null
    );

    return res.json({ success: true, message: 'Command reply recorded' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

/**
 * 4. Batch Sync from Edge
 * Contains incident metadata with Supabase Storage public URLs (bypasses 4.5MB Vercel limit)
 */
app.post('/api/edge/batch_sync', async (req, res) => {
  try {
    const { edge_id, auth_token, incidents = [] } = req.body || {};
    if (!edge_id) {
      return res.status(400).json({ detail: 'edge_id is required' });
    }

    const isValid = await db.verifyEdgeToken(edge_id, auth_token);
    if (!isValid) {
      return res.status(403).json({ detail: 'Invalid or missing edge authentication token' });
    }

    const syncedLocalIds = await db.storeBatchIncidents(edge_id, incidents);

    return res.json({
      success: true,
      synced_count: syncedLocalIds.length,
      synced_ids: syncedLocalIds,
      received_count: incidents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default app;
