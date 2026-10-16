// --- Supabase Client Integration ---
// Provides unified client for Orvexa Cloud master platform operations.
// Supports automatic fallback when credentials are not yet populated.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xkiutrwppsnvvogmxtby.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_ANON_KEY) &&
    SUPABASE_ANON_KEY !== 'your_supabase_anon_key_here' &&
    SUPABASE_ANON_KEY.length > 20
  )
}

// Create typed Supabase client with dummy fallback if keys aren't set yet
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'placeholder-anon-key-for-initialization',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
)

/**
 * Health check helper to verify connection to Supabase database.
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean
  configured: boolean
  url: string
  message: string
  latencyMs?: number
}> {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      configured: false,
      url: SUPABASE_URL,
      message: 'Supabase URL set, but anon API key is pending configuration in .env',
    }
  }

  const start = performance.now()
  try {
    const { error } = await supabase.from('tenants').select('count', { count: 'exact', head: true })
    const latency = Math.round(performance.now() - start)
    if (error && error.code !== 'PGRST116') {
      return {
        connected: false,
        configured: true,
        url: SUPABASE_URL,
        message: `Connection returned: ${error.message} (${error.code})`,
        latencyMs: latency,
      }
    }
    return {
      connected: true,
      configured: true,
      url: SUPABASE_URL,
      message: `Connected to Supabase (${SUPABASE_URL}) successfully.`,
      latencyMs: latency,
    }
  } catch (err: any) {
    return {
      connected: false,
      configured: true,
      url: SUPABASE_URL,
      message: `Network error connecting to Supabase: ${err?.message || err}`,
    }
  }
}
