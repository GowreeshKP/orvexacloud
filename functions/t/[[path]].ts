/**
 * Legacy /t/{slug}[/dashboard] on the Pages host.
 * Seller deep-links → /dashboard/{slug}. Storefront keep /t/{slug} for local preview
 * unless X-Orvexa-Storefront-Proxy is set (marketing already proxies).
 */

type PagesContext = {
  request: Request
  params: { path?: string | string[] }
  next: (input?: Request | string) => Promise<Response>
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url)
  const host = url.hostname.toLowerCase()
  const parts = Array.isArray(context.params.path)
    ? context.params.path
    : String(context.params.path || '')
        .split('/')
        .filter(Boolean)

  // Marketing storefront proxy must keep serving /t/{slug} as the SPA shell.
  if (context.request.headers.get('x-orvexa-storefront-proxy') === '1') {
    return context.next()
  }

  const slug = (parts[0] || '').toLowerCase()
  if (!SLUG_RE.test(slug)) return context.next()

  const onDashboard = (parts[1] || '').toLowerCase() === 'dashboard'
  const isAppHost = host === 'app.orvexacloud.in' || host === 'admin.orvexacloud.in'
  // On production app host, bare /t/{slug} means seller dashboard.
  // On *.pages.dev keep /t/{slug}/dashboard as the dashboard path (no redirect).
  if (isAppHost || onDashboard) {
    if (isAppHost) {
      const dest = new URL(`https://app.orvexacloud.in/dashboard/${slug}`)
      if (onDashboard && parts.length > 2) dest.pathname += `/${parts.slice(2).join('/')}`
      dest.search = url.search
      return Response.redirect(dest.toString(), 302)
    }
    // Preview host already at /t/{slug}/dashboard — let the SPA handle it.
    return context.next()
  }

  return context.next()
}
