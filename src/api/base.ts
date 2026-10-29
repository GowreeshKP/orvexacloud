// Shared API origin helpers for Cloudflare Workers + local Vite.
// Prefer VITE_API_URL (origin only). VITE_API_BASE_URL remains supported for older envs.
//
// On the marketing host (orvexacloud.in) storefronts must call the platform API on
// app.orvexacloud.in — marketing /api/* is the signup connector, not store APIs.

import { PLATFORM_ROOT_DOMAIN } from '@/data/plans'

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const rawOrigin = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : ''
const rawBase =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL.trim() : ''

/** Origin only, e.g. https://api.orvexacloud.in — empty means same-origin. */
export const API_ORIGIN = trimSlash(rawOrigin)

function runtimeApiBase(): string {
  if (rawBase) return trimSlash(rawBase)
  if (API_ORIGIN) return `${API_ORIGIN}/api`
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === PLATFORM_ROOT_DOMAIN || host === `www.${PLATFORM_ROOT_DOMAIN}`) {
      return `https://app.${PLATFORM_ROOT_DOMAIN}/api`
    }
  }
  return '/api'
}

/**
 * Base path for REST calls that already include `/admin`, `/auth`, `/stores`, etc.
 * Local/app host: `/api` (Worker proxy → Render)
 * Marketing host storefronts: `https://app.orvexacloud.in/api`
 */
export const API_BASE = runtimeApiBase()
