// --- Authenticated API Client ---
// Wraps fetch to automatically inject the Bearer access token from AuthContext.
// Falls back gracefully when no auth token is available (public/storefront routes).
//
// Usage:
//   const api = useApiClient()
//   const products = await api.get('/api/stores/lunar/products')
//   const result = await api.post('/api/stores/lunar/orders', orderData)

import { useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_ORIGIN } from '@/api/base'

const API_BASE = API_ORIGIN

type FetchOptions = Omit<RequestInit, 'body'> & { body?: unknown }

function buildRequest(
  method: string,
  accessToken: string | null,
  options: FetchOptions = {}
): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const { body: _body, headers: _headers, ...restOptions } = options

  const init: RequestInit = {
    ...restOptions,
    method,
    headers,
  }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body) as BodyInit
  }

  return init
}

export function useApiClient() {
  const { accessToken } = useAuth()

  const request = useCallback(
    async <T = unknown>(method: string, path: string, options: FetchOptions = {}): Promise<T> => {
      const url = path.startsWith('http') ? path : `${API_BASE}${path}`
      const init = buildRequest(method, accessToken, options)
      const res = await fetch(url, init)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status} — ${res.statusText}`)
      }

      // 204 No Content
      if (res.status === 204) return undefined as T

      return res.json() as Promise<T>
    },
    [accessToken]
  )

  return {
    get: <T = unknown>(path: string, options?: FetchOptions) =>
      request<T>('GET', path, options),
    post: <T = unknown>(path: string, body?: unknown, options?: FetchOptions) =>
      request<T>('POST', path, { ...options, body }),
    put: <T = unknown>(path: string, body?: unknown, options?: FetchOptions) =>
      request<T>('PUT', path, { ...options, body }),
    delete: <T = unknown>(path: string, options?: FetchOptions) =>
      request<T>('DELETE', path, options),
    patch: <T = unknown>(path: string, body?: unknown, options?: FetchOptions) =>
      request<T>('PATCH', path, { ...options, body }),
  }
}

/** Standalone (non-hook) API client for use outside React components */
export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  accessToken: string | null,
  body?: unknown
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const init = buildRequest(method, accessToken, body !== undefined ? { body } : {})
  const res = await fetch(url, init)

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
