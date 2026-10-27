/**
 * Cloudflare Pages Function — reverse-proxy /api/* to the Render Express API.
 * Lets the SPA call same-origin /api while the Node backend runs on Render.
 *
 * Set Pages env (Production):
 *   RENDER_API_ORIGIN=https://orvexa-api-nskw.onrender.com
 * Later, after custom domain DNS: https://api.orvexacloud.in (same host as Render)
 */

type PagesContext = {
  request: Request
  params: { path?: string | string[] }
  env: { RENDER_API_ORIGIN?: string }
}

const DEFAULT_ORIGIN = 'https://orvexa-api-nskw.onrender.com'

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
  headers.set('x-forwarded-for', context.request.headers.get('cf-connecting-ip') || '')

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
  out.set('access-control-allow-origin', incoming.origin)
  out.set('vary', 'Origin')
  return new Response(upstream.body, { status: upstream.status, headers: out })
}
