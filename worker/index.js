/**
 * Cloudflare Worker in front of the Vite build.
 * Static files and the SPA shell come from the assets binding.
 * /api/* is proxied to the Render API. Workers static assets otherwise
 * answer POST /api with 405, so platform admin sign-in never reaches the server.
 *
 * Path portals /t/{slug} redirect to https://{slug}.orvexacloud.in so each
 * approved store runs on its own subdomain (storefront + /dashboard admin).
 */

const DEFAULT_ORIGIN = 'https://orvexa-api-nskw.onrender.com'
const ROOT_DOMAIN = 'orvexacloud.in'
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    const redirected = pathPortalRedirect(url)
    if (redirected) return redirected

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxyApi(request, url, env)
    }
    return env.ASSETS.fetch(request)
  },
}

/** /t/{slug}[/dashboard][/…] → https://{slug}.orvexacloud.in[/dashboard][/…] */
function pathPortalRedirect(url) {
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return null

  const parts = url.pathname.toLowerCase().split('/').filter(Boolean)
  if (parts[0] !== 't' || !parts[1] || !SLUG_RE.test(parts[1])) return null

  const slug = parts[1]
  // Already on the tenant subdomain — do not loop.
  if (host === `${slug}.${ROOT_DOMAIN}`) return null

  const onDashboard = parts[2] === 'dashboard'
  const rest = onDashboard ? parts.slice(3) : parts.slice(2)
  let dest = `https://${slug}.${ROOT_DOMAIN}${onDashboard ? '/dashboard' : '/'}`
  if (rest.length) {
    dest = `${dest.replace(/\/+$/, '')}/${rest.join('/')}`
  }
  if (url.search) dest += url.search
  return Response.redirect(dest, 302)
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
