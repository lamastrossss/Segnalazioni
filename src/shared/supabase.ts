import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

let client: SupabaseClient | null = null;

export function getClient(storageKeySuffix?: string): SupabaseClient {
  if (!client) {
    client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'stage-review-auth' + (storageKeySuffix ? `-${storageKeySuffix}` : ''),
      },
    });
  }
  return client;
}

export async function probeSupabase(): Promise<boolean> {
  try {
    const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/health`, { headers: { apikey: CONFIG.supabaseAnonKey } });
    return r.status < 500;
  } catch {
    return false;
  }
}
