import { supabase, BUCKET_NAME } from './supabase.js';
import { hashEdgeToken, verifyEdgeTokenHash, verifyPassword, hashPassword } from './auth.js';
import crypto from 'crypto';

export const DEFAULT_OWNER_ID = 'OWN-DEFAULT-SYSTEM';

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'hotel';
}

export const db = {
  // ── Multi-Tenant Hotels & Slug Registry ────────────────────────────────────
  async getSlugRegistry() {
    const { data } = await supabase
      .from('central_settings')
      .select('value')
      .eq('key', 'hotel_slug_registry')
      .maybeSingle();

    let registry = {};
    if (data?.value) {
      try {
        registry = JSON.parse(data.value);
      } catch {
        registry = {};
      }
    }

    // Ensure default system owner has a default slug
    if (!registry['grand-hotel'] && !Object.values(registry).includes(DEFAULT_OWNER_ID)) {
      registry['grand-hotel'] = DEFAULT_OWNER_ID;
      await this.saveSlugRegistry(registry);
    }
    return registry;
  },

  async saveSlugRegistry(registry) {
    await supabase.from('central_settings').upsert({
      key: 'hotel_slug_registry',
      value: JSON.stringify(registry),
      updated_at: new Date().toISOString(),
    });
    return true;
  },

  async listHotels() {
    const { data: ownersData, error } = await supabase
      .from('owners')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const owners = ownersData || [];
    const registry = await this.getSlugRegistry();

    // Invert registry for quick lookup by owner_id
    const ownerToSlug = {};
    for (const [slug, id] of Object.entries(registry)) {
      ownerToSlug[id] = slug;
    }

    // Get nodes counts per owner
    const { data: nodes } = await supabase.from('edge_nodes').select('id, owner_id, status, last_heartbeat');
    const nodesList = nodes || [];
    const now = Date.now();

    // Get admin users per owner
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('id, username, owner_id, role, is_superadmin');
    const admins = adminUsers || [];

    return owners.map((owner) => {
      let slug = ownerToSlug[owner.id] || slugify(owner.company_name);
      const ownerNodes = nodesList.filter((n) => n.owner_id === owner.id);
      const onlineNodes = ownerNodes.filter((n) => {
        const lastHb = n.last_heartbeat ? new Date(n.last_heartbeat).getTime() : 0;
        return now - lastHb < 35000;
      });
      const admin = admins.find((a) => a.owner_id === owner.id && !a.is_superadmin) ||
                    admins.find((a) => a.owner_id === owner.id);

      return {
        id: owner.id,
        name: owner.company_name === 'Default Hotel Management' ? 'Grand Hotel' : owner.company_name,
        slug,
        contact_email: owner.contact_email,
        status: owner.status || 'active',
        max_kitchens: owner.max_kitchens || 20,
        created_at: owner.created_at,
        kitchen_count: ownerNodes.length,
        online_count: onlineNodes.length,
        admin_username: admin && !admin.is_superadmin ? admin.username : slug,
      };
    });
  },

  async getHotelBySlug(rawSlug) {
    const slug = slugify(rawSlug);
    const registry = await this.getSlugRegistry();
    let targetOwnerId = registry[slug];

    if (!targetOwnerId) {
      // Fallback: search owners whose company_name slugifies to this
      const { data: owners } = await supabase.from('owners').select('*');
      const found = (owners || []).find(
        (o) => slugify(o.company_name) === slug || slugify(o.id) === slug
      );
      if (found) {
        targetOwnerId = found.id;
        // Save to registry for permanent fast resolution
        registry[slug] = targetOwnerId;
        await this.saveSlugRegistry(registry);
      }
    }

    if (!targetOwnerId) return null;

    const owner = await this.getOwner(targetOwnerId);
    if (!owner) return null;

    return {
      id: owner.id,
      name: owner.company_name === 'Default Hotel Management' ? 'Grand Hotel' : owner.company_name,
      slug,
      contact_email: owner.contact_email,
      status: owner.status || 'active',
      max_kitchens: owner.max_kitchens || 20,
      created_at: owner.created_at,
    };
  },

  async createHotel({
    company_name,
    slug,
    contact_email = '',
    max_kitchens = 20,
    admin_username,
    admin_password,
  }) {
    if (!company_name || !company_name.trim()) throw new Error('Hotel company name is required');
    if (!admin_username || !admin_username.trim()) throw new Error('Hotel admin username is required');
    if (!admin_password || !admin_password.trim()) throw new Error('Hotel admin password is required');

    let resolvedSlug = slugify(slug || company_name);
    const registry = await this.getSlugRegistry();

    // Prevent collision on slug
    if (registry[resolvedSlug]) {
      resolvedSlug = `${resolvedSlug}-${crypto.randomBytes(2).toString('hex').toLowerCase()}`;
    }

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('username', admin_username.trim())
      .maybeSingle();
    if (existingUser) {
      throw new Error(`Username "${admin_username}" is already taken. Please choose another.`);
    }

    const ownerId = `OWN-${resolvedSlug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // 1. Insert into owners
    const { data: newOwner, error: ownerErr } = await supabase
      .from('owners')
      .insert({
        id: ownerId,
        company_name: company_name.trim(),
        contact_email: (contact_email || `${resolvedSlug}@hotel.local`).trim(),
        status: 'active',
        max_kitchens: Number(max_kitchens) || 20,
      })
      .select()
      .single();
    if (ownerErr) throw ownerErr;

    // 2. Save slug in registry
    registry[resolvedSlug] = ownerId;
    await this.saveSlugRegistry(registry);

    // 3. Create Hotel Admin User
    const passHash = await hashPassword(admin_password);
    const { error: userErr } = await supabase.from('admin_users').insert({
      username: admin_username.trim(),
      password_hash: passHash,
      role: 'hotel_admin',
      owner_id: ownerId,
      is_superadmin: false,
    });
    if (userErr) throw userErr;

    return {
      success: true,
      hotel: {
        id: ownerId,
        name: company_name,
        slug: resolvedSlug,
        contact_email: newOwner.contact_email,
        status: newOwner.status,
      },
      admin_username: admin_username.trim(),
    };
  },

  async updateHotel(ownerId, updates = {}) {
    const updateData = {};
    if (updates.company_name) updateData.company_name = updates.company_name.trim();
    if (updates.contact_email) updateData.contact_email = updates.contact_email.trim();
    if (updates.status) updateData.status = updates.status;
    if (updates.max_kitchens != null) updateData.max_kitchens = Number(updates.max_kitchens);

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('owners')
        .update(updateData)
        .eq('id', ownerId);
      if (error) throw error;
    }

    if (updates.slug) {
      const newSlug = slugify(updates.slug);
      const registry = await this.getSlugRegistry();
      // Remove old key for this owner
      for (const [s, id] of Object.entries(registry)) {
        if (id === ownerId && s !== newSlug) {
          delete registry[s];
        }
      }
      registry[newSlug] = ownerId;
      await this.saveSlugRegistry(registry);
    }

    return await this.getOwner(ownerId);
  },

  async resetHotelAdminPassword(ownerId, newPassword) {
    if (!newPassword || newPassword.length < 5) {
      throw new Error('New password must be at least 5 characters long');
    }
    const passHash = await hashPassword(newPassword);

    // 1. Check if an existing tenant user exists (is_superadmin: false)
    const { data: existingUser } = await supabase
      .from('admin_users')
      .select('id, username')
      .eq('owner_id', ownerId)
      .eq('is_superadmin', false)
      .limit(1)
      .maybeSingle();

    if (existingUser) {
      const { error } = await supabase
        .from('admin_users')
        .update({ password_hash: passHash })
        .eq('id', existingUser.id);
      if (error) throw error;
    } else {
      // 2. Auto-create tenant user for this hotel
      const registry = await this.getSlugRegistry();
      const slug = Object.entries(registry).find(([s, id]) => id === ownerId)?.[0] || slugify(ownerId);
      const { error } = await supabase
        .from('admin_users')
        .insert({
          username: slug,
          password_hash: passHash,
          role: 'hotel_admin',
          owner_id: ownerId,
          is_superadmin: false,
        });
      if (error) throw error;
    }
    return true;
  },

  async deleteHotel(ownerId) {
    if (ownerId === DEFAULT_OWNER_ID) {
      throw new Error('Cannot delete the default system hotel owner');
    }

    // Remove from registry
    const registry = await this.getSlugRegistry();
    for (const [slug, id] of Object.entries(registry)) {
      if (id === ownerId) {
        delete registry[slug];
      }
    }
    await this.saveSlugRegistry(registry);

    // Delete edge nodes, violations, admin users, owner
    await supabase.from('fleet_violations').delete().eq('owner_id', ownerId);
    await supabase.from('edge_nodes').delete().eq('owner_id', ownerId);
    await supabase.from('pairing_codes').delete().eq('owner_id', ownerId);
    await supabase.from('admin_users').delete().eq('owner_id', ownerId);
    const { error } = await supabase.from('owners').delete().eq('id', ownerId);
    if (error) throw error;
    return true;
  },

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
    if (ownerId && ownerId !== 'all') {
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
    if (ownerId && ownerId !== 'all') {
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
      cameras = [],
    } = payload;

    let targetOwnerId = (owner_id || DEFAULT_OWNER_ID).trim();
    const targetHotel = (hotel_name || 'Hotel').trim();
    const targetKitchen = (kitchen_name || 'Kitchen Appliance').trim();
    const requestedKitchenId = (payload.kitchen_id || payload.edge_id || '').trim();

    // Check if targetOwnerId matches a registered Hotel Endpoint / Slug (e.g. 'ritz-carlton', 'grand-hotel')
    try {
      const registry = await this.getSlugRegistry();
      const cleanSlug = slugify(targetOwnerId);
      if (registry[cleanSlug]) {
        targetOwnerId = registry[cleanSlug];
      }
    } catch (slugErr) {
      console.warn('[registerKitchenConnection] Warning checking slug registry:', slugErr.message);
    }

    // Ensure target owner exists in `owners` table to avoid foreign key violation
    try {
      await this.getOrCreateOwner(targetOwnerId, targetHotel);
    } catch (ownerErr) {
      console.warn('[registerKitchenConnection] Warning ensuring owner exists:', ownerErr.message);
    }

    // Support pairing_pin, pairing_code, pin, or otp
    const pairingPin = String(
      payload.pairing_pin || payload.pairing_code || payload.pin || payload.otp || ''
    ).trim().toUpperCase();

    // Check pairing pin validity
    let matchedCode = null;
    if (pairingPin) {
      matchedCode = await this.getPairingCode(pairingPin, targetOwnerId);
      if (!matchedCode && targetOwnerId !== DEFAULT_OWNER_ID) {
        matchedCode = await this.getPairingCode(pairingPin, DEFAULT_OWNER_ID);
      }
      if (!matchedCode) {
        matchedCode = await this.getPairingCode(pairingPin, null);
      }
      if (!matchedCode || matchedCode.used || new Date(matchedCode.expires_at) < new Date()) {
        return { success: false, error: 'Invalid or expired pairing code' };
      }
    }

    const resolvedHotel = hotel_name ? targetHotel : (matchedCode?.hotel_name || targetHotel);
    const resolvedKitchen = kitchen_name ? targetKitchen : (matchedCode?.kitchen_name || targetKitchen);

    // ── Prevent Duplicate Node Creation / Multi-Branch Separation ────────────
    let existingNode = null;

    // 1. Match by requested kitchen_id ONLY IF hotel and kitchen name match!
    // If another laptop copied or cloned the repo, it might have inherited an old kitchen_id.
    // If the branch or kitchen name differs, do NOT overwrite the existing branch's node.
    if (requestedKitchenId) {
      const { data: byId } = await supabase
        .from('edge_nodes')
        .select('*')
        .eq('id', requestedKitchenId)
        .maybeSingle();
      if (byId) {
        const hotelMatches = !resolvedHotel || (byId.hotel_name && byId.hotel_name.toLowerCase().trim() === resolvedHotel.toLowerCase());
        const kitchenMatches = !resolvedKitchen || (byId.name && byId.name.toLowerCase().trim() === resolvedKitchen.toLowerCase());
        if (hotelMatches && kitchenMatches) {
          existingNode = byId;
        }
      }
    }

    // 2. Match by pairing pin if it was previously used by an edge
    if (!existingNode && matchedCode?.used_by_edge_id) {
      const { data: byCodeEdge } = await supabase
        .from('edge_nodes')
        .select('*')
        .eq('id', matchedCode.used_by_edge_id)
        .maybeSingle();
      if (byCodeEdge) existingNode = byCodeEdge;
    }

    // 3. Match by (hotel_name, name) to prevent duplicate cards for the exact same kitchen
    if (!existingNode && resolvedHotel && resolvedKitchen) {
      let query = supabase
        .from('edge_nodes')
        .select('*')
        .ilike('hotel_name', resolvedHotel)
        .ilike('name', resolvedKitchen);
      if (targetOwnerId && targetOwnerId !== DEFAULT_OWNER_ID) {
        query = query.eq('owner_id', targetOwnerId);
      }
      const { data: byNameList } = await query.order('created_at', { ascending: false }).limit(1);
      if (byNameList && byNameList.length > 0) {
        existingNode = byNameList[0];
      }
    }

    // If existingNode is found, reuse its id. Otherwise generate a brand new unique kitchen ID.
    const edgeId = existingNode ? existingNode.id : `KITCHEN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const requestId = existingNode?.request_id || `REQ-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Auto-approve if valid pairing pin provided OR if the existing node was already approved
    const isAlreadyApproved = existingNode && existingNode.enrollment_status === 'approved';
    const autoApprove = Boolean(matchedCode) || isAlreadyApproved;

    let rawToken = null;
    let hashedToken = existingNode?.auth_token || null;
    if (autoApprove) {
      rawToken = crypto.randomBytes(24).toString('hex');
      hashedToken = hashEdgeToken(rawToken);
    }

    let nodeData = null;

    if (existingNode) {
      // Update existing node in place — NO duplicate card created!
      const updateData = {
        name: resolvedKitchen,
        hotel_name: resolvedHotel,
        owner_id: targetOwnerId,
        location: location || existingNode.location || 'Kitchen Area',
        ip_address: ip_address || existingNode.ip_address || '',
        api_url: api_url || existingNode.api_url || '',
        status: autoApprove ? 'online' : existingNode.status,
        enrollment_status: autoApprove ? 'approved' : existingNode.enrollment_status,
        auth_token: hashedToken,
        cameras_json: Array.isArray(cameras) && cameras.length > 0 ? cameras : existingNode.cameras_json,
        last_heartbeat: new Date().toISOString(),
      };
      if (matchedCode) {
        updateData.pairing_pin = pairingPin;
        updateData.approved_by = 'Auto (Pairing PIN)';
        updateData.approved_at = new Date().toISOString();
      }
      const { data: updated, error: updateErr } = await supabase
        .from('edge_nodes')
        .update(updateData)
        .eq('id', edgeId)
        .select()
        .single();
      if (updateErr) throw updateErr;
      nodeData = updated;
    } else {
      // Insert new unique node for this branch/kitchen
      const insertData = {
        id: edgeId,
        name: resolvedKitchen,
        hotel_name: resolvedHotel,
        location: location || 'Kitchen Area',
        ip_address: ip_address || '',
        api_url: api_url || '',
        status: autoApprove ? 'online' : 'warning',
        enrollment_status: autoApprove ? 'approved' : 'pending',
        owner_id: targetOwnerId,
        request_id: requestId,
        pairing_pin: pairingPin || null,
        auth_token: hashedToken,
        cameras_json: cameras,
        approved_by: autoApprove ? (matchedCode ? 'Auto (Pairing PIN)' : 'System') : null,
        approved_at: autoApprove ? new Date().toISOString() : null,
      };
      const { data: inserted, error: insertErr } = await supabase
        .from('edge_nodes')
        .insert(insertData)
        .select()
        .single();
      if (insertErr) throw insertErr;
      nodeData = inserted;
    }

    if (matchedCode) {
      await this.markPairingCodeUsed(matchedCode.code, matchedCode.owner_id || targetOwnerId, edgeId);
    }

    return {
      success: true,
      request_id: requestId,
      kitchen_id: edgeId,
      enrollment_status: nodeData.enrollment_status,
      status: nodeData.enrollment_status,
      token: rawToken,
      auth_token: rawToken,
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

    const records = await Promise.all(
      incidents.map(async (inc) => {
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

        return {
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
        };
      })
    );

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

    if (owner_id && owner_id !== 'all') {
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
    if (ownerId && ownerId !== 'all') {
      violQuery = violQuery.eq('owner_id', ownerId);
    }
    const { count: todayViolations } = await violQuery;

    // Unacknowledged count
    let unackQuery = supabase
      .from('fleet_violations')
      .select('id', { count: 'exact' })
      .eq('acknowledged', false);
    if (ownerId && ownerId !== 'all') {
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
  async authenticateAdmin(identifier, password) {
    if (!identifier || !password) return null;
    const cleanId = String(identifier).trim();

    const defaultUser = process.env.SHMS_ADMIN_USER || 'admin';
    const defaultPass = process.env.SHMS_ADMIN_PASS || 'vjv@shmsadmin.commm';

    // 1. Check if identifier matches a Hotel Endpoint / Slug (e.g. 'grand-hotel', 'ritz-carlton')
    const registry = await this.getSlugRegistry();
    const cleanSlug = slugify(cleanId);
    let targetOwnerId = registry[cleanSlug];

    let userRecord = null;

    if (targetOwnerId) {
      // Prioritize non-superadmin tenant users for hotel endpoints
      const { data: tenantUser } = await supabase
        .from('admin_users')
        .select('*')
        .eq('owner_id', targetOwnerId)
        .eq('is_superadmin', false)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tenantUser) {
        userRecord = tenantUser;
      }
    }

    // 2. Search admin_users by username
    if (!userRecord) {
      const { data: userByUsername } = await supabase
        .from('admin_users')
        .select('*')
        .ilike('username', cleanId)
        .maybeSingle();
      if (userByUsername) userRecord = userByUsername;
    }

    // 3. Search owners by contact_email
    if (!userRecord && cleanId.includes('@')) {
      const { data: ownerByEmail } = await supabase
        .from('owners')
        .select('id')
        .ilike('contact_email', cleanId)
        .maybeSingle();
      if (ownerByEmail) {
        const { data: userByEmailOwner } = await supabase
          .from('admin_users')
          .select('*')
          .eq('owner_id', ownerByEmail.id)
          .eq('is_superadmin', false)
          .limit(1)
          .maybeSingle();
        if (userByEmailOwner) userRecord = userByEmailOwner;
      }
    }

    // 4. Verify password for matched user
    if (userRecord && userRecord.password_hash) {
      // Check if hotel organization is suspended
      if (userRecord.owner_id && !userRecord.is_superadmin) {
        const owner = await this.getOwner(userRecord.owner_id);
        if (owner && owner.status === 'suspended') {
          throw new Error('Your hotel organization access has been suspended by the platform service provider.');
        }
      }

      const isValid = await verifyPassword(password, userRecord.password_hash);
      if (isValid) {
        return {
          id: userRecord.id,
          username: userRecord.username,
          role: userRecord.role,
          owner_id: userRecord.owner_id,
          is_superadmin: Boolean(userRecord.is_superadmin),
        };
      }
    }

    // 5. Fallback for grand-hotel tenant user (auto-provision default credentials)
    if (
      (cleanSlug === 'grand-hotel' || cleanId === 'grand-hotel' || cleanId === 'grand_admin') &&
      (password === 'grand123' || password === defaultPass)
    ) {
      try {
        const grandPass = password === 'grand123' ? 'grand123' : defaultPass;
        const grandHash = await hashPassword(grandPass);
        const { data: createdTenant } = await supabase
          .from('admin_users')
          .upsert(
            {
              username: 'grand-hotel',
              password_hash: grandHash,
              role: 'hotel_admin',
              owner_id: 'OWN-DEFAULT-SYSTEM',
              is_superadmin: false,
            },
            { onConflict: 'username' }
          )
          .select()
          .single();

        if (createdTenant) {
          return {
            id: createdTenant.id,
            username: createdTenant.username,
            role: 'hotel_admin',
            owner_id: 'OWN-DEFAULT-SYSTEM',
            is_superadmin: false,
          };
        }
      } catch (upsertErr) {
        console.warn('Auto-upsert grand-hotel tenant warning:', upsertErr);
      }
    }

    // 5. Fallback to default superadmin credentials & auto-heal database record
    if (cleanId === defaultUser && password === defaultPass) {
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
        id: userRecord?.id || 1,
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
