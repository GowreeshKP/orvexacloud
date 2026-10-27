#!/usr/bin/env node
/**
 * Sets production env vars on the Cloudflare Pages project via API.
 * Uses wrangler OAuth token from default.toml OR CLOUDFLARE_API_TOKEN.
 *
 *   node scripts/set-pages-env.mjs
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '31c38df0ec1ce2fdfa724530eff202b3'
const PROJECT = process.env.CF_PAGES_PROJECT || 'orvexatech-multi-store'

function loadWranglerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  const candidates = [
    path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    path.join(os.homedir(), '.wrangler', 'config', 'default.toml'),
  ]
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8')
      const m = text.match(/oauth_token\s*=\s*"([^"]+)"/)
      if (m) return m[1]
    } catch {
      // continue
    }
  }
  return null
}

const token = loadWranglerToken()
if (!token) {
  console.error('No Cloudflare token found.')
  process.exit(1)
}

const vars = {
  // Empty = same-origin /api via Pages Function proxy (functions/api/[[path]].ts)
  VITE_API_URL: '',
  VITE_DEMO_MODE: 'false',
  RENDER_API_ORIGIN: 'https://orvexa-api-nskw.onrender.com',
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deployment_configs: {
        production: {
          env_vars: Object.fromEntries(
            Object.entries(vars).map(([key, value]) => [key, { type: 'plain_text', value }])
          ),
        },
      },
    }),
  }
)

const body = await res.json()
if (!body.success) {
  console.error(JSON.stringify(body, null, 2))
  process.exit(1)
}
console.log(`Updated Pages project ${PROJECT} production env:`, Object.keys(vars).join(', '))
