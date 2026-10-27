#!/usr/bin/env node
/**
 * Creates DNS records for app.orvexacloud.in + api.orvexacloud.in on the Cloudflare
 * account that owns the orvexacloud.in zone.
 *
 * Requires a token with Zone:DNS:Edit for that zone:
 *   set CLOUDFLARE_API_TOKEN=...
 *   set RENDER_HOSTNAME=orvexa-multi-store-api.onrender.com   # after Render deploy
 *   node scripts/setup-cloudflare-dns.mjs
 *
 * Pages target defaults to orvexatech-multi-store.pages.dev
 */

const ZONE_NAME = process.env.CF_ZONE_NAME || 'orvexacloud.in'
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const PAGES_TARGET = process.env.PAGES_HOSTNAME || 'orvexatech-multi-store.pages.dev'
const RENDER_TARGET = process.env.RENDER_HOSTNAME || 'orvexa-api-nskw.onrender.com'

if (!TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN (Zone:DNS:Edit on orvexacloud.in).')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
}

async function cf(path, init) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers })
  const body = await res.json()
  if (!body.success) {
    throw new Error(`${path}: ${JSON.stringify(body.errors || body)}`)
  }
  return body
}

async function upsertCname(zoneId, name, target, proxied) {
  const full = name === '@' ? ZONE_NAME : `${name}.${ZONE_NAME}`
  const list = await cf(`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(full)}`)
  const existing = list.result?.[0]
  const payload = { type: 'CNAME', name, content: target, proxied, ttl: 1 }
  if (existing) {
    await cf(`/zones/${zoneId}/dns_records/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    console.log(`Updated CNAME ${full} → ${target} (proxied=${proxied})`)
  } else {
    await cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(payload) })
    console.log(`Created CNAME ${full} → ${target} (proxied=${proxied})`)
  }
}

const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`)
const zone = zones.result?.[0]
if (!zone) {
  console.error(`Zone ${ZONE_NAME} not found for this token/account.`)
  process.exit(1)
}

await upsertCname(zone.id, 'app', PAGES_TARGET, true)
// Render custom domains often prefer DNS-only initially for cert issuance.
await upsertCname(zone.id, 'api', RENDER_TARGET, false)
console.log('Done. Attach custom domains in Cloudflare Pages + Render dashboards if not already.')
