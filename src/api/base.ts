// Shared API origin helpers for Cloudflare Pages + local Vite.
// Prefer VITE_API_URL (origin only). VITE_API_BASE_URL remains supported for older envs.

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const rawOrigin = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : ''
const rawBase =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL.trim() : ''

/** Origin only, e.g. https://api.orvexacloud.in — empty means same-origin. */
export const API_ORIGIN = trimSlash(rawOrigin)

/**
 * Base path for REST calls that already include `/admin`, `/auth`, `/stores`, etc.
 * Local/Vercel-style same-origin: `/api`
 * Split hosting (Pages UI + Render API): `https://api.orvexacloud.in/api`
 */
export const API_BASE = rawBase
  ? trimSlash(rawBase)
  : API_ORIGIN
    ? `${API_ORIGIN}/api`
    : '/api'
