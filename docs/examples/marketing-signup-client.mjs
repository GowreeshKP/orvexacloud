/**
 * Drop-in client for marketing-site-orvexacloud → multi-store Super Admin intake.
 *
 * Env (marketing site):
 *   VITE_API_URL / API_URL          e.g. http://localhost:5000/api
 *   VITE_SIGNUP_SIGNING_SECRET      same value as SIGNUP_SIGNING_SECRETS on the API
 *
 * Usage (Node / server action — do not put the signing secret in a public browser bundle
 * unless you accept that anyone with the built JS can forge signups):
 *
 *   import { submitMerchantSignup, checkSlugAvailable } from './marketing-signup-client.mjs'
 *   await submitMerchantSignup({ owner, brand, plan, ... })
 */
import crypto from 'node:crypto'

const API_BASE = (process.env.VITE_API_URL || process.env.API_URL || 'http://localhost:5000/api').replace(/\/$/, '')
const SECRET = process.env.VITE_SIGNUP_SIGNING_SECRET || process.env.SIGNUP_SIGNING_SECRETS || ''

function sign(rawBody = '') {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature =
    'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex')
  return { timestamp, signature }
}

/**
 * @param {object} payload  schemaVersion 1 signup body (see docs/MARKETING_SIGNUP_CONNECTOR.md)
 * @returns {Promise<{ ok: boolean, status: number, json: any }>}
 */
export async function submitMerchantSignup(payload) {
  if (!SECRET) throw new Error('VITE_SIGNUP_SIGNING_SECRET / SIGNUP_SIGNING_SECRETS is not set')

  const body = {
    schemaVersion: 1,
    idempotencyKey: payload.idempotencyKey || crypto.randomUUID(),
    submittedAt: payload.submittedAt || new Date().toISOString(),
    ...payload,
  }
  const rawBody = JSON.stringify(body)
  const { timestamp, signature } = sign(rawBody)

  const res = await fetch(`${API_BASE}/public/signups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-orvexa-timestamp': timestamp,
      'x-orvexa-signature': signature,
      'Idempotency-Key': body.idempotencyKey,
    },
    body: rawBody,
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

/**
 * @param {string} slug
 * @returns {Promise<{ available: boolean, reason?: string }>}
 */
export async function checkSlugAvailable(slug) {
  if (!SECRET) throw new Error('VITE_SIGNUP_SIGNING_SECRET / SIGNUP_SIGNING_SECRETS is not set')
  const { timestamp, signature } = sign('')
  const res = await fetch(`${API_BASE}/public/slug-available?slug=${encodeURIComponent(slug)}`, {
    headers: {
      'x-orvexa-timestamp': timestamp,
      'x-orvexa-signature': signature,
    },
  })
  return res.json()
}
