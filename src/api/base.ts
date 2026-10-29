// Shared API origin helpers for Cloudflare Workers + local Vite.
// Prefer VITE_API_URL (origin only). VITE_API_BASE_URL remains supported for older envs.
//
// Same-origin /api on every host. Marketing worker forwards storefront API paths to Render;
// the signup connector keeps the remaining /api/* routes.

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const rawOrigin = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : ''
const rawBase =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL.trim() : ''

/** Origin only, e.g. https://api.orvexacloud.in — empty means same-origin. */
export const API_ORIGIN = trimSlash(rawOrigin)

function runtimeApiBase(): string {
  if (rawBase) return trimSlash(rawBase)
  if (API_ORIGIN) return `${API_ORIGIN}/api`
  return '/api'
}

/**
 * Base path for REST calls that already include `/admin`, `/auth`, `/stores`, etc.
 * Always same-origin `/api` unless an absolute VITE_API_* override is set.
 */
export const API_BASE = runtimeApiBase()
