#!/usr/bin/env node
/**
 * Pushes production secrets to a Render web service via the Render API.
 *
 *   set RENDER_API_KEY=rnd_...
 *   set RENDER_SERVICE_ID=srv_...   # optional if RENDER_SERVICE_NAME is set
 *   set RENDER_SERVICE_NAME=orvexa-multi-store-api
 *   node --env-file=.env scripts/apply-render-env.mjs
 *
 * Creates the Blueprint first in the Render dashboard (New → Blueprint → this repo),
 * then run this script to fill sync:false env vars from local .env.
 */

const API = 'https://api.render.com/v1'
const key = process.env.RENDER_API_KEY
if (!key) {
  console.error('Set RENDER_API_KEY from https://dashboard.render.com/u/settings#api-keys')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function render(path, init) {
  const res = await fetch(`${API}${path}`, { ...init, headers })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`)
  return body
}

let serviceId = process.env.RENDER_SERVICE_ID
const wantName = process.env.RENDER_SERVICE_NAME || 'orvexa-multi-store-api'
if (!serviceId) {
  const list = await render('/services?limit=50')
  const hit = (list || []).find((row) => row.service?.name === wantName || row.name === wantName)
  serviceId = hit?.service?.id || hit?.id
}
if (!serviceId) {
  console.error(
    `Service "${wantName}" not found. Create it first: Render → New → Blueprint → select orvexatech-multi-store (render.yaml).`
  )
  process.exit(1)
}

const required = [
  'MONGODB_MASTER_URI',
  'MONGODB_TENANT_BASE_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'SIGNUP_SIGNING_SECRETS',
  'ADMIN_BOOTSTRAP_KEY',
]

const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error('Missing in env:', missing.join(', '))
  process.exit(1)
}

const envVars = [
  { key: 'NODE_ENV', value: 'production' },
  { key: 'TRUST_PROXY', value: '1' },
  { key: 'PLATFORM_ROOT_DOMAIN', value: 'orvexacloud.in' },
  { key: 'PUBLIC_APP_URL', value: 'https://app.orvexacloud.in' },
  {
    key: 'CORS_ORIGIN',
    value: 'https://app.orvexacloud.in,https://orvexacloud.in,http://localhost:8443,http://localhost:3000',
  },
  { key: 'ACCESS_TOKEN_TTL', value: process.env.ACCESS_TOKEN_TTL || '1h' },
  { key: 'MONGODB_MASTER_URI', value: process.env.MONGODB_MASTER_URI },
  { key: 'MONGODB_TENANT_BASE_URI', value: process.env.MONGODB_TENANT_BASE_URI },
  { key: 'JWT_SECRET', value: process.env.JWT_SECRET },
  { key: 'JWT_REFRESH_SECRET', value: process.env.JWT_REFRESH_SECRET },
  { key: 'ADMIN_BOOTSTRAP_KEY', value: process.env.ADMIN_BOOTSTRAP_KEY },
  { key: 'SIGNUP_SIGNING_SECRETS', value: process.env.SIGNUP_SIGNING_SECRETS },
  { key: 'MAIL_FROM', value: process.env.MAIL_FROM || 'Orvexa Cloud <hello@mail.orvexacloud.in>' },
  { key: 'MAIL_REPLY_TO', value: process.env.MAIL_REPLY_TO || 'support@orvexacloud.in' },
]

if (process.env.RESEND_API_KEY) {
  envVars.push({ key: 'RESEND_API_KEY', value: process.env.RESEND_API_KEY })
}

await render(`/services/${serviceId}/env-vars`, {
  method: 'PUT',
  body: JSON.stringify(envVars),
})

console.log(`Updated ${envVars.length} env vars on Render service ${serviceId}. Trigger a deploy if Render did not auto-restart.`)
console.log('Then: Render → Settings → Custom Domains → add api.orvexacloud.in')
console.log('Then: CLOUDFLARE_API_TOKEN=... RENDER_HOSTNAME=<service>.onrender.com node scripts/setup-cloudflare-dns.mjs')
