// Shared API origin helpers for Cloudflare Workers + local Vite.
// Prefer VITE_API_URL (origin only). VITE_API_BASE_URL remains supported for older envs.
//
// On production browser hosts, call Render directly. Same-origin /api on app.orvexacloud.in
// is proxied through Cloudflare and repeatedly returns edge 429s under dashboard traffic.

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const rawOrigin = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : ''
const rawBase =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL.trim() : ''

/** Origin only, e.g. https://api.orvexacloud.in — empty means derive at runtime. */
export const API_ORIGIN = trimSlash(rawOrigin)

/** Stable Render API used when Cloudflare same-origin /api is rate-limited. */
export const RENDER_API_BASE = 'https://orvexa-api-nskw.onrender.com/api'

const FORCE_KEY = 'orvexa_use_render_api'

function preferRenderDirect(): boolean {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(FORCE_KEY) === '1') return true
  } catch {
    // storage disabled
  }
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  // Local Vite keeps same-origin /api (dev proxy). Production hosts go straight to Render.
  return Boolean(host && host !== 'localhost' && host !== '127.0.0.1')
}

function runtimeApiBase(): string {
  if (rawBase) return trimSlash(rawBase)
  if (API_ORIGIN) return `${API_ORIGIN}/api`
  if (preferRenderDirect()) return RENDER_API_BASE
  return '/api'
}

/**
 * Base path for REST calls that already include `/admin`, `/auth`, `/stores`, etc.
 * Re-evaluated so a mid-session Cloudflare 429 can flip traffic to Render.
 */
export function resolveApiBase(): string {
  return runtimeApiBase()
}

/** @deprecated Prefer resolveApiBase() — kept for existing imports; snapshot at module load. */
export const API_BASE = runtimeApiBase()

export function forceRenderApi(on = true) {
  try {
    if (on) sessionStorage.setItem(FORCE_KEY, '1')
    else sessionStorage.removeItem(FORCE_KEY)
  } catch {
    // storage disabled
  }
}

/**
 * fetch() relative to the API root (`/public/resolve?...`).
 * On Cloudflare edge 429 against same-origin /api, retries once via Render.
 */
export async function apiFetch(apiPath: string, init?: RequestInit): Promise<Response> {
  const rel = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const primary = `${resolveApiBase()}${rel}`
  const res = await fetch(primary, init)
  if (res.status !== 429) return res
  if (resolveApiBase() === RENDER_API_BASE) return res
  forceRenderApi(true)
  return fetch(`${RENDER_API_BASE}${rel}`, init)
}
