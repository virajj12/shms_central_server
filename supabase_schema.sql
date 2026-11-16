-- ============================================================================
-- SHMS Central Server - Supabase PostgreSQL Production Schema
-- Designed for Vercel Serverless + Supabase Storage Architecture (Approach B)
-- ============================================================================

-- Enable pgcrypto for UUID generation and hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Tenant Owners Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'trial')),
    max_kitchens INTEGER DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default System Owner
INSERT INTO owners (id, company_name, contact_email, status, max_kitchens)
VALUES ('OWN-DEFAULT-SYSTEM', 'Default Hotel Management', 'admin@shms.local', 'active', 50)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 1. Pairing Codes Table (One-Touch Edge Node Provisioning)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pairing_codes (
    code TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    hotel_name TEXT NOT NULL,
    kitchen_name TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_by_edge_id TEXT,
    used_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 2. Edge Nodes Fleet Registry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edge_nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hotel_name TEXT NOT NULL,
    location TEXT NOT NULL,
    ip_address TEXT,
    api_url TEXT NOT NULL DEFAULT '',
    status TEXT DEFAULT 'online' CHECK(status IN ('online', 'offline', 'warning', 'error')),
    cameras_json JSONB DEFAULT '[]'::jsonb,
    telemetry_json JSONB DEFAULT '{}'::jsonb,
    config_json JSONB DEFAULT '{}'::jsonb,
    pending_commands_json JSONB DEFAULT '[]'::jsonb,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    auth_token TEXT,
    owner_id TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM' REFERENCES owners(id) ON DELETE CASCADE,
    enrollment_status TEXT NOT NULL DEFAULT 'pending' CHECK(enrollment_status IN ('pending', 'approved', 'rejected')),
    request_id TEXT,
    pairing_pin TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    last_hourly_sync TIMESTAMPTZ,
    unsynced_count INTEGER DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- 3. Edge Commands Queue (For Live Snapshots & Remote Actions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edge_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edge_id TEXT NOT NULL REFERENCES edge_nodes(id) ON DELETE CASCADE,
    command TEXT NOT NULL,                  -- 'capture_snapshot', 'trigger_sync', 'update_config'
    payload JSONB DEFAULT '{}'::jsonb,      -- e.g. {"camera_id": "cam_kitchen_1"}
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
    result_b64 TEXT,                        -- Ephemeral base64 for live snapshot (cleared or expired)
    result_url TEXT,                        -- Optional CDN URL if stored
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 4. Fleet-wide Incidents & Evidence
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_violations (
    id BIGSERIAL PRIMARY KEY,
    edge_id TEXT NOT NULL REFERENCES edge_nodes(id) ON DELETE CASCADE,
    edge_name TEXT,
    hotel_name TEXT,
    camera_id TEXT NOT NULL,
    camera_name TEXT,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    confidence REAL DEFAULT 0.0,
    amfv_ratio REAL DEFAULT 0.0,
    snapshot_filename TEXT,
    snapshot_url TEXT,                      -- Permanent Supabase Storage CDN URL
    acknowledged BOOLEAN DEFAULT FALSE,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    local_violation_id INTEGER,
    owner_id TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM' REFERENCES owners(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. Admin Users Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'superadmin',
    owner_id TEXT NOT NULL DEFAULT 'OWN-DEFAULT-SYSTEM' REFERENCES owners(id) ON DELETE CASCADE,
    is_superadmin BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Superadmin (Username: admin, Password: vjv@shmsadmin.commm)
INSERT INTO admin_users (username, password_hash, role, owner_id, is_superadmin)
VALUES ('admin', '$2b$10$8LBsojKFVJ/v0dbPPzQnpuwHR36gqml.85GkwdhqZ4L0u6dz3ErZG', 'superadmin', 'OWN-DEFAULT-SYSTEM', TRUE)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- ----------------------------------------------------------------------------
-- 6. Central Settings Key-Value Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS central_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. Audit Logs Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_edge_id TEXT,
    details TEXT
);

-- ----------------------------------------------------------------------------
-- Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_violations_timestamp ON fleet_violations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_violations_edge ON fleet_violations(edge_id);
CREATE INDEX IF NOT EXISTS idx_violations_category ON fleet_violations(category);
CREATE INDEX IF NOT EXISTS idx_violations_owner_time ON fleet_violations(owner_id, timestamp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_violations_edge_local ON fleet_violations(edge_id, local_violation_id) WHERE local_violation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_edge_status ON edge_nodes(status);
CREATE INDEX IF NOT EXISTS idx_edge_owner_status ON edge_nodes(owner_id, enrollment_status);
CREATE INDEX IF NOT EXISTS idx_pairing_owner_code ON pairing_codes(owner_id, code, used);
CREATE INDEX IF NOT EXISTS idx_edge_commands_pending ON edge_commands(edge_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_edge_commands_id_status ON edge_commands(id, status);

-- ----------------------------------------------------------------------------
-- Storage Bucket Instructions:
-- In Supabase Dashboard -> Storage:
-- 1. Create a bucket named: evidence-snapshots
-- 2. Make it Public (or add policy below)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence-snapshots', 'evidence-snapshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read Evidence" ON storage.objects
    FOR SELECT USING (bucket_id = 'evidence-snapshots');

CREATE POLICY "Allow Edge Uploads" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'evidence-snapshots');
