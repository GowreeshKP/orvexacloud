/**
 * Cloudflare Pages Function — reverse-proxy /api/* to the Render Express API.
 * Lets the SPA call same-origin /api while the Node backend runs on Render.
 *
 * Set Pages env (Production):
 *   RENDER_API_ORIGIN=https://orvexa-api-nskw.onrender.com
 */

type PagesContext = {
  request: Request
  params: { path?: string | string[] }
  env: { RENDER_API_ORIGIN?: string }
}

const DEFAULT_ORIGIN = 'https://orvexa-api-nskw.onrender.com'

function withCors(response: Response, allowOrigin: string): Response {
  const out = new Headers(response.headers)
  out.set('access-control-allow-origin', allowOrigin)
  out.set('access-control-allow-credentials', 'true')
  out.set('vary', 'Origin')
  return new Response(response.body, { status: response.status, headers: out })
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const origin = (context.env.RENDER_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const incoming = new URL(context.request.url)
  const parts = context.params.path
  const suffix = Array.isArray(parts) ? parts.join('/') : parts || ''
  const target = `${origin}/api/${suffix}${incoming.search}`

  const headers = new Headers(context.request.headers)
  headers.delete('host')
  // Drop browser Origin so Render CORS does not reject the server-side proxy hop.
  headers.delete('origin')
  headers.set('x-forwarded-host', incoming.host)
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''))
  const clientIp =
    context.request.headers.get('cf-connecting-ip') ||
    context.request.headers.get('x-real-ip') ||
    (context.request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  if (clientIp) {
    headers.set('cf-connecting-ip', clientIp)
    headers.set('x-real-ip', clientIp)
    headers.set('x-forwarded-for', clientIp)
  }

  const reqOrigin = context.request.headers.get('Origin') || ''
  let allowOrigin = incoming.origin
  try {
    const host = reqOrigin ? new URL(reqOrigin).hostname.toLowerCase() : ''
    if (
      host === 'orvexacloud.in' ||
      host === 'www.orvexacloud.in' ||
      host === 'app.orvexacloud.in' ||
      host.endsWith('.orvexacloud.in')
    ) {
      allowOrigin = reqOrigin
    }
  } catch {
    /* keep incoming.origin */
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': allowOrigin,
        'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers':
          context.request.headers.get('Access-Control-Request-Headers') || 'content-type,authorization',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    })
  }

  // Answer health at the edge — never proxy or rate-limit probes to Render.
  if (
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    (suffix === 'health' || suffix === 'health/')
  ) {
    const body = JSON.stringify({
      status: 'healthy',
      platform: 'Orvexa Tech Multi-Tenant Engine',
      timestamp: new Date().toISOString(),
      runtime: 'cloudflare-pages',
      edge: true,
    })
    return withCors(
      new Response(context.request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=15, stale-while-revalidate=60',
        },
      }),
      allowOrigin,
    )
  }

  // Edge cache store bootstrap — stops admin/dashboard refresh storms from 429ing Render.
  const isResolveGet =
    context.request.method === 'GET' && (suffix === 'public/resolve' || suffix.startsWith('public/resolve?'))
  if (isResolveGet) {
    const cacheKey = new Request(target, { method: 'GET' })
    const cached = await caches.default.match(cacheKey)
    if (cached) return withCors(cached, allowOrigin)
  }

  const init: RequestInit = {
    method: context.request.method,
    headers,
    redirect: 'manual',
  }
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body
    // @ts-expect-error duplex required for streaming bodies in some runtimes
    init.duplex = 'half'
  }

  const upstream = await fetch(target, init)
  const out = new Headers(upstream.headers)
  out.set('access-control-allow-origin', allowOrigin)
  out.set('access-control-allow-credentials', 'true')
  out.set('vary', 'Origin')

  if (isResolveGet && upstream.ok) {
    out.set('cache-control', 'public, max-age=30, stale-while-revalidate=120')
    const cacheable = new Response(upstream.body, { status: upstream.status, headers: out })
    const cacheKey = new Request(target, { method: 'GET' })
    await caches.default.put(cacheKey, cacheable.clone()).catch(() => null)
    return cacheable
  }

  return new Response(upstream.body, { status: upstream.status, headers: out })
}
