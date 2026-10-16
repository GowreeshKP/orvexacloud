import { isReservedHost, looksLikeAsset, slugFromHostname, slugFromPath } from './routing'

export interface Env {
  ROOT_DOMAIN: string
  API_ORIGIN: string
  SHOP_ORIGIN: string
  MEDIA?: R2Bucket
}

const RESOLVE_TTL_MS = 60_000
const resolveCache = new Map<string, { slug: string | null; at: number }>()

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const host = url.hostname.toLowerCase()

    if (url.pathname.startsWith('/api/')) {
      return proxy(request, env.API_ORIGIN, url.pathname + url.search)
    }

    if (host === `media.${env.ROOT_DOMAIN}` && env.MEDIA) {
      const object = await env.MEDIA.get(url.pathname.replace(/^\//, ''))
      if (!object) return new Response('Not found', { status: 404 })
      const headers = new Headers()
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      object.writeHttpMetadata(headers)
      return new Response(object.body, { headers })
    }

    if (isReservedHost(host, env.ROOT_DOMAIN) && !slugFromPath(url.pathname)) {
      return new Response('Not found', { status: 404 })
    }

    const slug =
      slugFromPath(url.pathname) ||
      slugFromHostname(host, env.ROOT_DOMAIN) ||
      (await resolveCustomHost(host, env))

    if (!slug) {
      return new Response('Store not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }

    const dest = new URL(url.pathname + url.search, env.SHOP_ORIGIN)
    if (!slugFromPath(url.pathname)) dest.searchParams.set('tenant', slug)

    const upstream = await fetch(new Request(dest.toString(), request))
    if (upstream.status === 404 && request.method === 'GET' && !looksLikeAsset(url.pathname)) {
      const index = new URL('/', env.SHOP_ORIGIN)
      index.searchParams.set('tenant', slug)
      return fetch(new Request(index.toString(), request))
    }
    return upstream
  },
}

async function resolveCustomHost(host: string, env: Env): Promise<string | null> {
  const now = Date.now()
  const hit = resolveCache.get(host)
  if (hit && now - hit.at < RESOLVE_TTL_MS) return hit.slug

  try {
    const res = await fetch(`${env.API_ORIGIN}/api/public/resolve?host=${encodeURIComponent(host)}`, {
      headers: { Accept: 'application/json' },
    })
    const body = (await res.json()) as { slug?: string }
    const slug = res.ok && typeof body.slug === 'string' ? body.slug : null
    resolveCache.set(host, { slug, at: now })
    return slug
  } catch {
    resolveCache.set(host, { slug: null, at: now })
    return null
  }
}

function proxy(request: Request, origin: string, pathAndQuery: string): Promise<Response> {
  return fetch(new Request(new URL(pathAndQuery, origin).toString(), request))
}
