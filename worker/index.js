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

function corsAllowOrigin(request, fallbackOrigin) {
  const reqOrigin = request.headers.get('Origin') || ''
  if (!reqOrigin) return fallbackOrigin
  try {
    const host = new URL(reqOrigin).hostname.toLowerCase()
    if (
      host === ROOT_DOMAIN ||
      host === `www.${ROOT_DOMAIN}` ||
      host === `app.${ROOT_DOMAIN}` ||
      host.endsWith(`.${ROOT_DOMAIN}`)
    ) {
      return reqOrigin
    }
  } catch {
    /* ignore */
  }
  return fallbackOrigin
}

function withCors(response, allowOrigin) {
  const out = new Headers(response.headers)
  out.set('access-control-allow-origin', allowOrigin)
  out.set('access-control-allow-credentials', 'true')
  out.set('vary', 'Origin')
  return new Response(response.body, { status: response.status, headers: out })
}

async function proxyApi(request, url, env) {
  const origin = String(env.RENDER_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const target = `${origin}${url.pathname}${url.search}`
  const allowOrigin = corsAllowOrigin(request, url.origin)

  // Short edge cache for store bootstrap — stops admin/storefront refresh storms from 429ing Render.
  const isResolveGet = request.method === 'GET' && url.pathname === '/api/public/resolve'
  if (isResolveGet) {
    const cacheKey = new Request(target, { method: 'GET' })
    const cached = await caches.default.match(cacheKey)
    if (cached) return withCors(cached, allowOrigin)
  }

  // Browser preflight from marketing storefronts (orvexacloud.in → app /api).
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': allowOrigin,
        'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers':
          request.headers.get('Access-Control-Request-Headers') || 'content-type,authorization',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    })
  }

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('origin')
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') || '')

  const isProfilePut =
    request.method === 'PUT' && /^\/api\/stores\/[^/]+\/profile$/.test(url.pathname)
  const isThemePut =
    request.method === 'PUT' && /^\/api\/stores\/[^/]+\/theme$/.test(url.pathname)
  // Buffer body when we may rewrite image URLs or re-play for the profile→theme shim.
  let rawBody = null
  if (isProfilePut || isThemePut) {
    rawBody = await request.arrayBuffer()
  }
  if (isThemePut && rawBody) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(rawBody))
      let changed = false
      for (const key of ['logoUrl', 'heroImage']) {
        const v = parsed[key]
        if (typeof v === 'string' && v.trim() && !/^https?:\/\//i.test(v) && !v.startsWith('data:image/')) {
          parsed[key] = ''
          changed = true
        }
      }
      if (changed) {
        rawBody = new TextEncoder().encode(JSON.stringify(parsed)).buffer
        headers.set('content-type', 'application/json')
        headers.delete('content-length')
      }
    } catch {
      /* keep original body */
    }
  }

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = rawBody !== null ? rawBody : request.body
    if (rawBody === null) init.duplex = 'half'
  }

  const upstream = await fetch(target, init)

  // Older Render builds omit PUT /stores/:slug/profile. Shim via theme so storefront saves do not 404.
  if (upstream.status === 404 && isProfilePut) {
    let body = {}
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody || new ArrayBuffer(0)))
    } catch {
      body = {}
    }
    const parts = url.pathname.split('/')
    const slug = parts[3]
    const auth = request.headers.get('authorization') || ''
    const logoUrl = body.logo || body.logoUrl
    const copy = {}
    if (body.brandName) copy._profileBrandName = String(body.brandName)
    if (body.aboutStory) copy._profileAbout = String(body.aboutStory)
    if (body.contact && typeof body.contact === 'object') {
      if (body.contact.phone) copy._profilePhone = String(body.contact.phone)
      if (body.contact.email) copy._profileEmail = String(body.contact.email)
      if (body.contact.address) copy._profileAddress = String(body.contact.address)
      if (body.contact.workingHours) copy._profileHours = String(body.contact.workingHours)
      if (body.contact.shippingThresholdFormatted) {
        copy._profileShipping = String(body.contact.shippingThresholdFormatted)
      }
    }
    const themeBody = {
      ...(typeof logoUrl === 'string' ? { logoUrl } : {}),
      ...(body.tagline ? { tagline: String(body.tagline) } : {}),
      ...(body.aboutStory ? { aboutStory: String(body.aboutStory) } : {}),
      ...(Object.keys(copy).length ? { copy } : {}),
    }
    if (Object.keys(themeBody).length) {
      await fetch(`${origin}/api/stores/${slug}/theme`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: auth } : {}),
        },
        body: JSON.stringify(themeBody),
      }).catch(() => null)
    }
    return new Response(
      JSON.stringify({
        success: true,
        shimmed: true,
        tenant: { slug, brandName: body.brandName, logo: logoUrl, contact: body.contact },
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': allowOrigin,
          'access-control-allow-credentials': 'true',
          vary: 'Origin',
        },
      }
    )
  }

  const out = new Headers(upstream.headers)
  out.set('access-control-allow-origin', allowOrigin)
  out.set('access-control-allow-credentials', 'true')
  out.set('vary', 'Origin')

  if (isResolveGet && upstream.ok) {
    out.set('cache-control', 'public, max-age=30')
    const cacheable = new Response(upstream.body, { status: upstream.status, headers: out })
    const cacheKey = new Request(target, { method: 'GET' })
    await caches.default.put(cacheKey, cacheable.clone()).catch(() => null)
    return cacheable
  }

  return new Response(upstream.body, { status: upstream.status, headers: out })
}
