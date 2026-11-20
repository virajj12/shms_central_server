import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { db, DEFAULT_OWNER_ID, slugify } from '../lib/db.js';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  requireAdmin,
  requireSuperadmin,
  requireHotelTenant,
  verifySessionToken,
} from '../lib/auth.js';
import { sendPasswordResetEmail, getEmailTransporter } from '../lib/email.js';
import { supabase } from '../lib/supabase.js';

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
      return res.status(401).json({ detail: 'Invalid username, endpoint, or password' });
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

// ── Forgot Password Flow (Run via SMTP App Password) ─────────────────────────

app.post('/api/auth/forgot_password/request', async (req, res) => {
  try {
    const clean = String(req.body?.identifier || '').trim();
    if (!clean) {
      return res.status(400).json({ detail: 'Please enter your hotel endpoint handle or username.' });
    }

    // 1. Look up hotel by slug or username or email
    let hotel = await db.getHotelBySlug(clean);
    let owner = null;
    if (hotel) {
      owner = await db.getOwner(hotel.id);
    } else {
      const { data: user } = await supabase
        .from('admin_users')
        .select('*')
        .ilike('username', clean)
        .maybeSingle();
      if (user) {
        owner = await db.getOwner(user.owner_id);
      }
    }

    if (!owner && clean.includes('@')) {
      const { data: byEmail } = await supabase
        .from('owners')
        .select('*')
        .ilike('contact_email', clean)
        .maybeSingle();
      if (byEmail) owner = byEmail;
    }

    if (!owner) {
      return res.status(404).json({
        detail: `No registered hotel found for endpoint "${clean}". Please verify your endpoint handle with your service provider.`,
      });
    }

    // 2. Generate 6-digit OTP (expires in 15 mins)
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const otpKey = `pwd_reset_${owner.id}`;
    await db.setSettings({
      [otpKey]: JSON.stringify({ otp, expiresAt, owner_id: owner.id }),
    });

    const registry = await db.getSlugRegistry();
    const slug =
      Object.entries(registry).find(([s, id]) => id === owner.id)?.[0] ||
      slugify(owner.company_name);

    // 3. Mask email
    const email = owner.contact_email || 'admin@hotel.local';
    const [localPart, domain] = email.split('@');
    const maskedLocal =
      localPart.length > 2 ? `${localPart.slice(0, 2)}***` : `${localPart}***`;
    const maskedEmail = `${maskedLocal}@${domain || 'hotel.local'}`;

    // 4. Send email via SMTP App Password
    const sendResult = await sendPasswordResetEmail({
      toEmail: email,
      hotelName: owner.company_name,
      hotelSlug: slug,
      otpCode: otp,
    });

    db.logAudit(
      'SYSTEM',
      'FORGOT_PASSWORD_REQUEST',
      null,
      `Password reset requested for hotel ${owner.company_name} (${email})`
    );

    return res.json({
      success: true,
      message: `A 6-digit verification code has been sent to your registered email (${maskedEmail})`,
      masked_email: maskedEmail,
      owner_id: owner.id,
      sent: true,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ detail: err.message || 'Failed to process password reset request' });
  }
});

app.post('/api/auth/forgot_password/verify', async (req, res) => {
  try {
    const { owner_id, otp, new_password } = req.body || {};
    if (!owner_id || !otp || !new_password) {
      return res.status(400).json({ detail: 'Hotel Owner ID, OTP, and new password are required' });
    }
    if (String(new_password).length < 5) {
      return res.status(400).json({ detail: 'New password must be at least 5 characters long' });
    }

    const settings = await db.getSettings();
    const raw = settings[`pwd_reset_${owner_id}`];
    if (!raw) {
      return res.status(400).json({
        detail: 'No active password reset request found or session expired. Please request a new code.',
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(400).json({ detail: 'Invalid reset session' });
    }

    if (Date.now() > parsed.expiresAt) {
      return res.status(400).json({
        detail: 'Verification code has expired (15 minute limit). Please request a new code.',
      });
    }

    if (String(parsed.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ detail: 'Incorrect 6-digit verification code. Please check and try again.' });
    }

    // Reset password
    await db.resetHotelAdminPassword(owner_id, new_password);

    // Clear OTP
    await db.setSettings({ [`pwd_reset_${owner_id}`]: '' });

    db.logAudit(
      'USER',
      'RESET_PASSWORD_VERIFY',
      null,
      `Password successfully reset via OTP for owner ${owner_id}`
    );

    return res.json({
      success: true,
      message: 'Password updated successfully! You can now sign in with your new password.',
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message || 'Failed to reset password' });
  }
});

// Test SMTP App Password configuration
app.post('/api/admin/email/test', requireSuperadmin, async (req, res) => {
  try {
    const { test_email } = req.body || {};
    const targetEmail = test_email || req.body?.smtp_user || 'test@example.com';

    const sendResult = await sendPasswordResetEmail({
      toEmail: targetEmail,
      hotelName: 'Test Hotel Organization',
      hotelSlug: 'test-hotel',
      otpCode: '123456',
    });

    return res.json(sendResult);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
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

// ── Public Vanity Hotel Lookup ──────────────────────────────────────────────
app.get('/api/public/hotel/:slug', async (req, res) => {
  try {
    const hotel = await db.getHotelBySlug(req.params.slug);
    if (!hotel) {
      return res.status(404).json({ exists: false, detail: 'Hotel not found' });
    }
    return res.json({
      exists: true,
      hotel: {
        id: hotel.id,
        name: hotel.name,
        slug: hotel.slug,
        status: hotel.status,
      },
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Multi-Tenant Hotel Management (Superadmin Only) ─────────────────────────
app.get('/api/admin/hotels', requireSuperadmin, async (req, res) => {
  try {
    const hotels = await db.listHotels();
    return res.json(hotels);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/admin/hotels', requireSuperadmin, async (req, res) => {
  try {
    const result = await db.createHotel(req.body || {});
    db.logAudit(req.user.sub, 'CREATE_HOTEL', null, `Created hotel ${result.hotel.name} (/@${result.hotel.slug})`);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

app.put(['/api/admin/hotels/:id', '/api/admin/hotels/:id/update'], requireSuperadmin, async (req, res) => {
  try {
    const hotel = await db.updateHotel(req.params.id, req.body || {});
    db.logAudit(req.user.sub, 'UPDATE_HOTEL', req.params.id, `Updated hotel ${req.params.id}`);
    return res.json(hotel);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

app.patch('/api/admin/hotels/:id', requireSuperadmin, async (req, res) => {
  try {
    const hotel = await db.updateHotel(req.params.id, req.body || {});
    db.logAudit(req.user.sub, 'UPDATE_HOTEL', req.params.id, `Updated hotel ${req.params.id}`);
    return res.json(hotel);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

app.post('/api/admin/hotels/:id/reset_password', requireSuperadmin, async (req, res) => {
  try {
    const { new_password } = req.body || {};
    await db.resetHotelAdminPassword(req.params.id, new_password);
    db.logAudit(req.user.sub, 'RESET_HOTEL_PASSWORD', req.params.id, `Reset password for hotel ${req.params.id}`);
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

app.delete('/api/admin/hotels/:id', requireSuperadmin, async (req, res) => {
  try {
    await db.deleteHotel(req.params.id);
    db.logAudit(req.user.sub, 'DELETE_HOTEL', req.params.id, `Deleted hotel ${req.params.id}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// ── Fleet Overview & KPIs (Hotel Tenant Only) ──────────────────────────────
app.get('/api/fleet/overview', requireHotelTenant, async (req, res) => {
  try {
    const kpis = await db.getFleetKpis(req.user.owner_id);
    return res.json(kpis);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/fleet/owner_info', requireHotelTenant, async (req, res) => {
  try {
    const owner = await db.getOwner(req.user.owner_id);
    return res.json(owner || { id: req.user.owner_id, company_name: 'Hotel Management' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Enrollment & Pairing (Hotel Tenant Only) ────────────────────────────────

app.get('/api/fleet/enrollment/pending', requireHotelTenant, async (req, res) => {
  try {
    const pending = await db.listPendingEnrollments(req.user.owner_id);
    return res.json({ success: true, edges: pending });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/enrollment/:requestId/approve', requireHotelTenant, async (req, res) => {
  try {
    const { requestId } = req.params;
    const node = await db.getEdgeEnrollment(requestId, req.user.owner_id);
    if (!node) return res.status(404).json({ detail: 'Enrollment request not found for your hotel' });
    const result = await db.setEdgeEnrollmentStatus(requestId, 'approved', req.user.sub);
    db.logAudit(req.user.sub, 'APPROVE_ENROLLMENT', result.id, `Approved request ${requestId}`);
    return res.json({ success: true, node: result });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/enrollment/:requestId/reject', requireHotelTenant, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason = 'Rejected by hotel management' } = req.body || {};
    const node = await db.getEdgeEnrollment(requestId, req.user.owner_id);
    if (!node) return res.status(404).json({ detail: 'Enrollment request not found for your hotel' });
    const result = await db.setEdgeEnrollmentStatus(requestId, 'rejected', req.user.sub, reason);
    db.logAudit(req.user.sub, 'REJECT_ENROLLMENT', result.id, `Reason: ${reason}`);
    return res.json({ success: true, node: result });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/pairing_codes', requireHotelTenant, async (req, res) => {
  try {
    const { hotel_name, kitchen_name, ttl_minutes = 60 } = req.body || {};
    const owner = await db.getOwner(req.user.owner_id);
    const pairing = await db.createPairingCode(
      req.user.owner_id,
      hotel_name || owner?.company_name || 'Hotel',
      kitchen_name || 'Main Kitchen',
      req.user.sub,
      ttl_minutes
    );

    db.logAudit(req.user.sub, 'CREATE_PAIRING_CODE', null, `Created PIN ${pairing.code} for ${hotel_name || owner?.company_name}`);
    return res.json(pairing);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// ── Fleet Nodes & Remote Commands (Hotel Tenant Only) ───────────────────────

app.get('/api/fleet/nodes', requireHotelTenant, async (req, res) => {
  try {
    const nodes = await db.listNodes(req.user.owner_id);
    return res.json(nodes);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/fleet/nodes/:id', requireHotelTenant, async (req, res) => {
  try {
    const node = await db.getNode(req.params.id);
    if (!node || node.owner_id !== req.user.owner_id) {
      return res.status(404).json({ detail: 'Edge node not found' });
    }
    return res.json(node);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.delete('/api/fleet/nodes/:id', requireHotelTenant, async (req, res) => {
  try {
    const node = await db.getNode(req.params.id);
    if (!node || node.owner_id !== req.user.owner_id) {
      return res.status(404).json({ detail: 'Edge node not found for your hotel' });
    }
    const success = await db.deleteNode(req.params.id);
    db.logAudit(req.user.sub, 'DELETE_NODE', req.params.id, 'Edge node deleted');
    return res.json({ success });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/nodes/:id/config', requireHotelTenant, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const node = await db.getNode(edgeId);
    if (!node || node.owner_id !== req.user.owner_id) {
      return res.status(404).json({ detail: 'Edge node not found for your hotel' });
    }
    const configPayload = req.body || {};
    const command = await db.queueNodeCommand(edgeId, 'update_config', configPayload);
    db.logAudit(req.user.sub, 'UPDATE_CONFIG', edgeId, JSON.stringify(configPayload));
    return res.json({ success: true, command_id: command.id });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/nodes/:id/command', requireHotelTenant, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const node = await db.getNode(edgeId);
    if (!node || node.owner_id !== req.user.owner_id) {
      return res.status(404).json({ detail: 'Edge node not found for your hotel' });
    }
    const { type, payload = {} } = req.body || {};
    const command = await db.queueNodeCommand(edgeId, type || 'custom_command', payload);
    return res.json({ success: true, command_id: command.id });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/fleet/nodes/:id/trigger_sync', requireHotelTenant, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const node = await db.getNode(edgeId);
    if (!node || node.owner_id !== req.user.owner_id) {
      return res.status(404).json({ detail: 'Edge node not found for your hotel' });
    }
    const command = await db.queueNodeCommand(edgeId, 'trigger_sync', {});
    return res.json({ success: true, message: 'Sync command queued for edge node' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

/**
 * On-demand live snapshot request (Hotel Owner Only)
 * Queues 'capture_snapshot' command in edge_commands and awaits the reply (up to 7 seconds).
 */
app.post('/api/fleet/nodes/:id/request_snapshot', requireHotelTenant, async (req, res) => {
  try {
    const edgeId = req.params.id;
    const { camera_id = null } = req.body || {};

    const node = await db.getNode(edgeId);
    if (!node || node.owner_id !== req.user.owner_id) {
      return res.status(404).json({ detail: 'Edge node not found for your hotel' });
    }

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

// ── Violations & Analytics (Hotel Tenant Only) ──────────────────────────────

app.get('/api/fleet/violations', requireHotelTenant, async (req, res) => {
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

app.post('/api/fleet/violations/:id/acknowledge', requireHotelTenant, async (req, res) => {
  try {
    const success = await db.acknowledgeViolation(req.params.id, req.user.sub);
    return res.json({ success });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/fleet/analytics', requireHotelTenant, async (req, res) => {
  try {
    const data = await db.getAnalytics(req.user.owner_id);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/api/settings', requireSuperadmin, async (req, res) => {
  try {
    const settings = await db.getSettings();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.post('/api/settings', requireSuperadmin, async (req, res) => {
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
    const token = result.token || result.auth_token || '';
    return res.json({
      ...result,
      status: result.enrollment_status,
      auth_token: token,
      token: token,
      pin: req.body?.pairing_pin || req.body?.pairing_code || '',
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
    const edgeId = req.body?.edge_id || req.body?.kitchen_id;
    const authToken = req.body?.auth_token;
    const incidents = req.body?.incidents || [];
    if (!edgeId) {
      return res.status(400).json({ detail: 'edge_id or kitchen_id is required' });
    }

    const isValid = await db.verifyEdgeToken(edgeId, authToken);
    if (!isValid) {
      return res.status(403).json({ detail: 'Invalid or missing edge authentication token' });
    }

    const syncedLocalIds = await db.storeBatchIncidents(edgeId, incidents);

    return res.json({
      success: true,
      synced_count: syncedLocalIds.length,
      synced_ids: syncedLocalIds,
      synced_local_ids: syncedLocalIds,
      received_count: incidents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default app;
