/**
 * Cloudflare Worker in front of the Vite build (app.orvexacloud.in).
 * - Super Admin at /
 * - Tenant admin at /dashboard/{slug}
 * - Owner sign-in at /owner/{key}
 * - /api/* proxied to Render
 * - Legacy /t/{slug} → https://orvexacloud.in/{slug}
 */

const DEFAULT_ORIGIN = 'https://orvexa-api-nskw.onrender.com'
const ROOT_DOMAIN = 'orvexacloud.in'
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    const redirected = legacyPortalRedirect(request, url)
    if (redirected) return redirected

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxyApi(request, url, env)
    }
    return env.ASSETS.fetch(request)
  },
}

/** /t/{slug}[/dashboard] → production portals (skipped when marketing already proxies /{slug}). */
function legacyPortalRedirect(request, url) {
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return null
  // Marketing worker fetches /t/{slug} on behalf of https://orvexacloud.in/{slug} — do not bounce back.
  if (request.headers.get('x-orvexa-storefront-proxy') === '1') return null
  const fwd = (request.headers.get('x-forwarded-host') || '').toLowerCase()
  if (fwd === ROOT_DOMAIN || fwd === `www.${ROOT_DOMAIN}`) return null

  const parts = url.pathname.toLowerCase().split('/').filter(Boolean)
  if (parts[0] !== 't' || !parts[1] || !SLUG_RE.test(parts[1])) return null

  const slug = parts[1]
  const onDashboard = parts[2] === 'dashboard'
  const dest = onDashboard
    ? `https://app.${ROOT_DOMAIN}/dashboard/${slug}`
    : `https://${ROOT_DOMAIN}/${slug}`
  const rest = onDashboard ? parts.slice(3) : parts.slice(2)
  let target = dest
  if (rest.length) target = `${dest}/${rest.join('/')}`
  if (url.search) target += url.search
  return Response.redirect(target, 302)
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
