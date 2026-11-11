// Shared API origin helpers for Cloudflare Workers + local Vite.
// Prefer VITE_API_URL (origin only). VITE_API_BASE_URL remains supported for older envs.
//
// Default: same-origin `/api` (Pages Function / Worker → Render). Direct browser calls to
// Render fail CORS on *.pages.dev; only flip to Render after a same-origin 429.

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const rawOrigin = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : ''
const rawBase =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL.trim() : ''

/** Stable Render API used when Cloudflare same-origin /api is rate-limited. */
export const RENDER_API_BASE = 'https://orvexa-api-nskw.onrender.com/api'

function isBrowserSafeApiOrigin(origin: string): boolean {
  // Direct browser → Render is blocked by CORS on *.pages.dev / many preview hosts.
  // Same-origin /api (Pages Function / Worker) is the supported path; Render stays fallback-only.
  if (!origin) return false
  try {
    const host = new URL(origin).hostname.toLowerCase()
    if (host.endsWith('.onrender.com')) return false
  } catch {
    return false
  }
  return true
}

/** Origin only, e.g. https://api.orvexacloud.in — empty means same-origin /api at runtime. */
export const API_ORIGIN = isBrowserSafeApiOrigin(rawOrigin) ? trimSlash(rawOrigin) : ''

const FORCE_KEY = 'orvexa_use_render_api'

function preferRenderDirect(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(FORCE_KEY) === '1'
  } catch {
    return false
  }
}

function runtimeApiBase(): string {
  if (rawBase && isBrowserSafeApiOrigin(rawBase.replace(/\/api\/?$/, ''))) return trimSlash(rawBase)
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
  try {
    return await fetch(`${RENDER_API_BASE}${rel}`, init)
  } catch {
    // Render may block CORS from preview hosts — keep the original 429 for UI retry.
    forceRenderApi(false)
    return res
  }
}
