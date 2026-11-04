export const CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  publicBaseUrl: import.meta.env.VITE_PUBLIC_BASE_URL as string,
  studioDomain: 'thewavestudio.it',
  storageLimitBytes: 1_073_741_824,
} as const;
