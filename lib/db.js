import { supabase, BUCKET_NAME } from './supabase.js';
import { hashEdgeToken, verifyEdgeTokenHash, verifyPassword } from './auth.js';
import crypto from 'crypto';

export const DEFAULT_OWNER_ID = 'OWN-DEFAULT-SYSTEM';

export const db = {
  // ── Tenant Owners ──────────────────────────────────────────────────────────
  async getOwner(ownerId) {
    const { data, error } = await supabase
      .from('owners')
      .select('*')
      .eq('id', ownerId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getOrCreateOwner(ownerId, companyName, contactEmail) {
    const existing = await this.getOwner(ownerId);
    if (existing) return existing;
    const { data, error } = await supabase
      .from('owners')
      .insert({
        id: ownerId,
        company_name: companyName || 'Hotel Owner',
        contact_email: contactEmail || 'owner@shms.local',
        status: 'active',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── Pairing Codes ──────────────────────────────────────────────────────────
  async createPairingCode(ownerId, hotelName, kitchenName, createdBy, ttlMinutes = 60) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars, e.g. 'A1B2C3'
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('pairing_codes')
      .insert({
        code,
        owner_id: ownerId,
        hotel_name: hotelName,
        kitchen_name: kitchenName,
        created_by: createdBy,
        expires_at: expiresAt,
        used: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getPairingCode(code, ownerId) {
    let query = supabase.from('pairing_codes').select('*').eq('code', code.trim().toUpperCase());
    if (ownerId) query = query.eq('owner_id', ownerId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  },

  async markPairingCodeUsed(code, ownerId, edgeId) {
    const { error } = await supabase
      .from('pairing_codes')
      .update({
        used: true,
        used_by_edge_id: edgeId,
        used_at: new Date().toISOString(),
      })
      .eq('code', code)
      .eq('owner_id', ownerId);
    return !error;
  },

  // ── Edge Fleet Management ──────────────────────────────────────────────────
  async listNodes(ownerId = null) {
    let query = supabase.from('edge_nodes').select('*').order('created_at', { ascending: false });
    if (ownerId && ownerId !== DEFAULT_OWNER_ID) {
      query = query.eq('owner_id', ownerId);
    }
    const { data, error } = await query;
    if (error) throw error;

    // Check online/offline status based on last_heartbeat (35s threshold)
    const now = Date.now();
    return (data || []).map((node) => {
      const lastHb = node.last_heartbeat ? new Date(node.last_heartbeat).getTime() : 0;
      const isOnline = now - lastHb < 35000;
      return {
        ...node,
        status: node.enrollment_status === 'approved' ? (isOnline ? 'online' : 'offline') : node.enrollment_status,
        duplex_connected: isOnline,
        duplex_linked: isOnline,
        cameras: Array.isArray(node.cameras_json) ? node.cameras_json : [],
        telemetry: typeof node.telemetry_json === 'object' ? node.telemetry_json : {},
        config: typeof node.config_json === 'object' ? node.config_json : {},
      };
    });
  },

  async getNode(edgeId) {
    const { data, error } = await supabase
      .from('edge_nodes')
      .select('*')
      .eq('id', edgeId)
      .maybeSingle();
    if (error || !data) return null;

    const lastHb = data.last_heartbeat ? new Date(data.last_heartbeat).getTime() : 0;
    const isOnline = Date.now() - lastHb < 35000;
    return {
      ...data,
      status: data.enrollment_status === 'approved' ? (isOnline ? 'online' : 'offline') : data.enrollment_status,
      duplex_connected: isOnline,
      duplex_linked: isOnline,
      cameras: Array.isArray(data.cameras_json) ? data.cameras_json : [],
      telemetry: typeof data.telemetry_json === 'object' ? data.telemetry_json : {},
      config: typeof data.config_json === 'object' ? data.config_json : {},
    };
  },

  async deleteNode(edgeId) {
    const { error } = await supabase.from('edge_nodes').delete().eq('id', edgeId);
    return !error;
  },

  async verifyEdgeToken(edgeId, rawToken) {
    if (!rawToken) return false;
    const { data, error } = await supabase
      .from('edge_nodes')
      .select('auth_token, enrollment_status')
      .eq('id', edgeId)
      .maybeSingle();
    if (error || !data || data.enrollment_status !== 'approved') return false;
    return verifyEdgeTokenHash(rawToken, data.auth_token);
  },

  async getEdgeEnrollment(requestId, ownerId = null) {
    let query = supabase.from('edge_nodes').select('*').eq('request_id', requestId);
    if (ownerId && ownerId !== DEFAULT_OWNER_ID) {
      query = query.eq('owner_id', ownerId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) return null;
    return data;
  },

  async listPendingEnrollments(ownerId = null) {
    let query = supabase
      .from('edge_nodes')
      .select('*')
      .eq('enrollment_status', 'pending')
      .order('created_at', { ascending: false });
    if (ownerId && ownerId !== DEFAULT_OWNER_ID) {
      query = query.eq('owner_id', ownerId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async setEdgeEnrollmentStatus(requestId, status, approvedBy = null, rejectionReason = null) {
    const updateData = {
      enrollment_status: status,
      approved_by: approvedBy,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      rejection_reason: rejectionReason,
    };

    let generatedToken = null;
    if (status === 'approved') {
      generatedToken = crypto.randomBytes(24).toString('hex');
      updateData.auth_token = hashEdgeToken(generatedToken);
      updateData.status = 'online';
    }

    const { data, error } = await supabase
      .from('edge_nodes')
      .update(updateData)
      .or(`request_id.eq.${requestId},id.eq.${requestId}`)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Edge node not found for identifier: ${requestId}`);
    return { ...data, plain_token: generatedToken };
  },

  async registerKitchenConnection(payload) {
    const {
      hotel_name,
      kitchen_name,
      location,
      ip_address,
      api_url,
      owner_id = DEFAULT_OWNER_ID,
      pairing_pin,
      cameras = [],
    } = payload;

    // Check pairing pin validity
    let matchedCode = null;
    if (pairing_pin) {
      matchedCode = await this.getPairingCode(pairing_pin, owner_id);
      if (!matchedCode || matchedCode.used || new Date(matchedCode.expires_at) < new Date()) {
        return { success: false, error: 'Invalid or expired pairing code' };
      }
    }

    const requestId = `REQ-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const edgeId = `KITCHEN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const autoApprove = Boolean(matchedCode);

    let rawToken = null;
    let hashedToken = null;
    if (autoApprove) {
      rawToken = crypto.randomBytes(24).toString('hex');
      hashedToken = hashEdgeToken(rawToken);
    }

    const insertData = {
      id: edgeId,
      name: kitchen_name || 'Kitchen Appliance',
      hotel_name: hotel_name || (matchedCode ? matchedCode.hotel_name : 'Hotel'),
      location: location || 'Kitchen Area',
      ip_address: ip_address || '',
      api_url: api_url || '',
      status: autoApprove ? 'online' : 'warning',
      enrollment_status: autoApprove ? 'approved' : 'pending',
      owner_id: owner_id,
      request_id: requestId,
      pairing_pin: pairing_pin || null,
      auth_token: hashedToken,
      cameras_json: cameras,
      approved_by: autoApprove ? 'Auto (Pairing Code)' : null,
      approved_at: autoApprove ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase.from('edge_nodes').insert(insertData).select().single();
    if (error) throw error;

    if (matchedCode) {
      await this.markPairingCodeUsed(matchedCode.code, owner_id, edgeId);
    }

    return {
      success: true,
      request_id: requestId,
      kitchen_id: edgeId,
      enrollment_status: data.enrollment_status,
      token: rawToken,
    };
  },

  // ── Command Queue & Heartbeat ──────────────────────────────────────────────
  async processHeartbeat(edgeId, telemetry = {}, cameras = [], unsyncedCount = 0) {
    const updatePayload = {
      last_heartbeat: new Date().toISOString(),
      status: 'online',
      unsynced_count: unsyncedCount,
    };
    if (telemetry && Object.keys(telemetry).length > 0) {
      updatePayload.telemetry_json = telemetry;
    }
    if (Array.isArray(cameras) && cameras.length > 0) {
      updatePayload.cameras_json = cameras;
    }

    await supabase.from('edge_nodes').update(updatePayload).eq('id', edgeId);

    // Fetch and claim pending commands
    const { data: commands, error } = await supabase
      .from('edge_commands')
      .select('*')
      .eq('edge_id', edgeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error || !commands || commands.length === 0) return [];

    // Mark commands as in_progress
    const commandIds = commands.map((c) => c.id);
    await supabase
      .from('edge_commands')
      .update({ status: 'in_progress' })
      .in('id', commandIds);

    return commands;
  },

  async queueNodeCommand(edgeId, commandType, payload = {}) {
    const { data, error } = await supabase
      .from('edge_commands')
      .insert({
        edge_id: edgeId,
        command: commandType,
        payload: payload,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getCommand(commandId) {
    const { data, error } = await supabase
      .from('edge_commands')
      .select('*')
      .eq('id', commandId)
      .maybeSingle();
    if (error) return null;
    return data;
  },

  async replyNodeCommand(commandId, status, resultB64 = null, resultUrl = null, errorMessage = null) {
    const { error } = await supabase
      .from('edge_commands')
      .update({
        status: status || 'completed',
        result_b64: resultB64,
        result_url: resultUrl,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', commandId);
    return !error;
  },

  // ── Incidents & Evidence ───────────────────────────────────────────────────
  async storeBatchIncidents(edgeId, incidents = []) {
    if (!incidents || incidents.length === 0) return [];

    const node = await this.getNode(edgeId);
    const ownerId = node ? node.owner_id : DEFAULT_OWNER_ID;
    const hotelName = node ? node.hotel_name : 'Hotel';
    const edgeName = node ? node.name : 'Kitchen';

    const records = [];
    for (const inc of incidents) {
      let snapshotUrl = inc.snapshot_url || null;

      // Server-side upload to Supabase Storage if base64 provided and no direct url
      if (!snapshotUrl && (inc.snapshot_base64 || inc.snapshot_b64)) {
        try {
          const rawB64 = inc.snapshot_base64 || inc.snapshot_b64;
          const cleanB64 = rawB64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(cleanB64, 'base64');
          const fileName = inc.snapshot_filename || `${edgeId}_violation_${inc.local_id || inc.local_violation_id || Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
          const filePath = `incidents/${fileName}`;

          const { error: uploadErr } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, buffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(filePath);
            snapshotUrl = publicUrlData?.publicUrl || null;
          } else {
            console.warn('[storeBatchIncidents] Supabase storage upload warning:', uploadErr.message);
          }
        } catch (uploadExc) {
          console.error('[storeBatchIncidents] Failed to process snapshot_base64:', uploadExc.message);
        }
      }

      records.push({
        edge_id: edgeId,
        edge_name: edgeName,
        hotel_name: hotelName,
        camera_id: inc.camera_id || 'cam-1',
        camera_name: inc.camera_name || 'Camera 1',
        label: inc.label || 'violation',
        category: inc.category || 'hygiene',
        timestamp: inc.timestamp || new Date().toISOString(),
        confidence: inc.confidence || 0.0,
        amfv_ratio: inc.amfv_ratio || 0.0,
        snapshot_filename: inc.snapshot_filename || null,
        snapshot_url: snapshotUrl,
        local_violation_id: inc.local_id || inc.local_violation_id || null,
        owner_id: ownerId,
      });
    }

    // Fetch existing synced IDs for this edge node to prevent duplicates safely
    const allLocalIds = records.map((r) => r.local_violation_id).filter(Boolean);
    let existingIds = new Set();
    if (allLocalIds.length > 0) {
      const { data: existing } = await supabase
        .from('fleet_violations')
        .select('local_violation_id')
        .eq('edge_id', edgeId)
        .in('local_violation_id', allLocalIds);
      if (existing) {
        existingIds = new Set(existing.map((r) => r.local_violation_id));
      }
    }

    const recordsToInsert = records.filter(
      (r) => !r.local_violation_id || !existingIds.has(r.local_violation_id)
    );
    if (recordsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('fleet_violations')
        .insert(recordsToInsert);
      if (insertErr) throw insertErr;
    }

    // Update node last sync
    await supabase
      .from('edge_nodes')
      .update({
        last_hourly_sync: new Date().toISOString(),
        unsynced_count: 0,
      })
      .eq('id', edgeId);

    return allLocalIds;
  },

  async listViolations(params = {}) {
    const {
      owner_id = null,
      category = null,
      hotel_name = null,
      edge_id = null,
      acknowledged = null,
      limit = 100,
    } = params;

    let query = supabase
      .from('fleet_violations')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (owner_id && owner_id !== DEFAULT_OWNER_ID) {
      query = query.eq('owner_id', owner_id);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (hotel_name && hotel_name !== 'all') {
      query = query.eq('hotel_name', hotel_name);
    }
    if (edge_id) {
      query = query.eq('edge_id', edge_id);
    }
    if (acknowledged !== null) {
      query = query.eq('acknowledged', acknowledged);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async acknowledgeViolation(violationId, reviewedBy = 'admin') {
    const { error } = await supabase
      .from('fleet_violations')
      .update({
        acknowledged: true,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', violationId);
    return !error;
  },

  // ── Fleet Analytics & KPIs ─────────────────────────────────────────────────
  async getFleetKpis(ownerId = null) {
    const nodes = await this.listNodes(ownerId);
    const totalNodes = nodes.length;
    const onlineNodes = nodes.filter((n) => n.status === 'online').length;

    // Today's violations
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let violQuery = supabase
      .from('fleet_violations')
      .select('id, category, acknowledged', { count: 'exact' })
      .gte('timestamp', todayStart.toISOString());
    if (ownerId && ownerId !== DEFAULT_OWNER_ID) {
      violQuery = violQuery.eq('owner_id', ownerId);
    }
    const { count: todayViolations } = await violQuery;

    // Unacknowledged count
    let unackQuery = supabase
      .from('fleet_violations')
      .select('id', { count: 'exact' })
      .eq('acknowledged', false);
    if (ownerId && ownerId !== DEFAULT_OWNER_ID) {
      unackQuery = unackQuery.eq('owner_id', ownerId);
    }
    const { count: pendingAlerts } = await unackQuery;

    return {
      total_nodes: totalNodes,
      online_nodes: onlineNodes,
      offline_nodes: totalNodes - onlineNodes,
      today_violations: todayViolations || 0,
      pending_alerts: pendingAlerts || 0,
    };
  },

  async getAnalytics(ownerId = null) {
    const kpis = await this.getFleetKpis(ownerId);
    const violations = await this.listViolations({ owner_id: ownerId, limit: 500 });

    const categoryBreakdown = {};
    const hourlyCounts = Array(24).fill(0);

    for (const v of violations) {
      categoryBreakdown[v.category] = (categoryBreakdown[v.category] || 0) + 1;
      const hour = new Date(v.timestamp).getHours();
      hourlyCounts[hour] += 1;
    }

    return {
      kpis,
      categories: categoryBreakdown,
      hourly_trends: hourlyCounts,
      compliance_score: Math.max(75, 100 - (kpis.today_violations * 2)),
    };
  },

  // ── Admin Authentication ───────────────────────────────────────────────────
  async authenticateAdmin(username, password) {
    const defaultUser = process.env.SHMS_ADMIN_USER || 'admin';
    const defaultPass = process.env.SHMS_ADMIN_PASS || 'vjv@shmsadmin.commm';

    // 1. Fetch from Supabase
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (data && data.password_hash) {
      const isValid = await verifyPassword(password, data.password_hash);
      if (isValid) {
        return {
          id: data.id,
          username: data.username,
          role: data.role,
          owner_id: data.owner_id,
          is_superadmin: data.is_superadmin,
        };
      }
    }

    // 2. Fallback to default superadmin credentials & auto-heal database record
    if (username === defaultUser && password === defaultPass) {
      try {
        const validHash = await hashPassword(defaultPass);
        await supabase
          .from('admin_users')
          .upsert({
            username: defaultUser,
            password_hash: validHash,
            role: 'superadmin',
            owner_id: 'OWN-DEFAULT-SYSTEM',
            is_superadmin: true,
          }, { onConflict: 'username' });
      } catch (upsertErr) {
        console.warn('Auto-upsert admin hash warning:', upsertErr);
      }

      return {
        id: data?.id || 1,
        username: defaultUser,
        role: 'superadmin',
        owner_id: 'OWN-DEFAULT-SYSTEM',
        is_superadmin: true,
      };
    }

    return null;
  },

  // ── Settings & Audit Logs ──────────────────────────────────────────────────
  async getSettings() {
    const { data } = await supabase.from('central_settings').select('*');
    const settings = {};
    (data || []).forEach((row) => {
      settings[row.key] = row.value;
    });
    return settings;
  },

  async setSettings(payload = {}) {
    const records = Object.entries(payload).map(([key, value]) => ({
      key,
      value: String(value),
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('central_settings').upsert(records);
    return true;
  },

  async logAudit(actor, action, targetEdgeId = null, details = '') {
    try {
      await supabase.from('audit_logs').insert({
        actor,
        action,
        target_edge_id: targetEdgeId,
        details,
      });
    } catch {
      // Non-blocking audit logger
    }
  },
};
