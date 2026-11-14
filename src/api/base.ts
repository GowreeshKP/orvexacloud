// Shared API origin helpers for Cloudflare Workers + local Vite.
// Prefer VITE_API_URL (origin only). VITE_API_BASE_URL remains supported for older envs.
//
// Default: same-origin `/api` (Pages Function / Worker → Render).
// On Cloudflare edge 429, retry via Render for orvexacloud hosts (CORS-allowed).

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const rawOrigin = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : ''
const rawBase =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL.trim() : ''

/** Stable Render API used when Cloudflare same-origin /api is rate-limited. */
export const RENDER_API_BASE = 'https://orvexa-api-nskw.onrender.com/api'

function isBrowserSafeApiOrigin(origin: string): boolean {
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

/** Drop a stale Render-direct flag left by older builds. */
export function clearForcedRenderApi() {
  forceRenderApi(false)
}

function canUseRenderFallback(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'orvexacloud.in' || host === 'www.orvexacloud.in' || host.endsWith('.orvexacloud.in')
}

function isCredentialAuthPath(apiPath: string): boolean {
  return /\/auth\/[^/]+\/(login|forgot-password|reset-password|change-password|bootstrap)(\?|$)/.test(
    apiPath.startsWith('/') ? apiPath : `/${apiPath}`,
  )
}

/**
 * fetch() relative to the API root (`/public/resolve?...`).
 * On Cloudflare edge 429 against same-origin /api, retries once via Render
 * (only on orvexacloud hosts where Render CORS allows the browser Origin).
 * Credential login never falls across origins — a Render 429/CORS miss must not break sign-in.
 */
export async function apiFetch(apiPath: string, init?: RequestInit): Promise<Response> {
  const rel = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const credential = isCredentialAuthPath(rel)
  // Always prefer same-origin for password posts; clear a stale Render-direct flag first.
  if (credential) clearForcedRenderApi()
  const primary = `${credential ? '/api' : resolveApiBase()}${rel}`
  let res: Response
  try {
    res = await fetch(primary, init)
  } catch (err) {
    // Same-origin proxy down — try Render on production hosts (never for login/password).
    if (credential || !canUseRenderFallback() || resolveApiBase() === RENDER_API_BASE) throw err
    forceRenderApi(true)
    return fetch(`${RENDER_API_BASE}${rel}`, init)
  }
  if (res.status !== 429) return res
  if (credential || resolveApiBase() === RENDER_API_BASE || !canUseRenderFallback()) return res
  forceRenderApi(true)
  try {
    return await fetch(`${RENDER_API_BASE}${rel}`, init)
  } catch {
    forceRenderApi(false)
    return res
  }
}
