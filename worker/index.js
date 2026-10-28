/**
 * Cloudflare Worker in front of the Vite build.
 * Static files and the SPA shell come from the assets binding.
 * /api/* is proxied to the Render API. Workers static assets otherwise
 * answer POST /api with 405, so platform admin sign-in never reaches the server.
 */

const DEFAULT_ORIGIN = 'https://orvexa-api-nskw.onrender.com'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxyApi(request, url, env)
    }
    return env.ASSETS.fetch(request)
  },
}

async function proxyApi(request, url, env) {
  const origin = String(env.RENDER_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const target = `${origin}${url.pathname}${url.search}`

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('origin')
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') || '')

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }

  const upstream = await fetch(target, init)
  const out = new Headers(upstream.headers)
  out.set('access-control-allow-origin', url.origin)
  out.set('vary', 'Origin')
  return new Response(upstream.body, { status: upstream.status, headers: out })
}
