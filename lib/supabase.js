import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Supabase Warning] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined. ' +
    'Please configure your environment variables in Vercel or in .env.'
  );
}

// Service role client bypasses RLS for server-side management operations
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'evidence-snapshots';
