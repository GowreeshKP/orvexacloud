// --- Public Signup Connector API (version 1) ---
// Receives store applications from marketing-site-orvexacloud (HMAC-signed).
// Hand-off: docs/MARKETING_SIGNUP_CONNECTOR.md. The signature covers raw body bytes, so this
// router must be mounted before express.json().
//
//   POST /api/public/signups          signed store application  -> 201 { applicationId, status }
//   GET  /api/public/slug-available   signed availability check -> 200 { available }
//   GET  /api/public/resolve          public store bootstrap by slug or Host (unsigned)
//
// Status codes drive the connector's retries: 400/422 are final (never retried), while
// 401/403/5xx are retried for ~4 days. Temporary failures must therefore answer 503.

import { Router, raw, type Request, type Response } from 'express'
import crypto from 'crypto'
import type { Connection } from 'mongoose'
import { connectMasterDatabase } from '../config/db.js'
import { PLATFORM_ROOT_DOMAIN } from '../config/plans.js'
import { getApplicationModel, type IApplication } from '../models/master/Application.js'
import { getTenantModel, tenantAllowsSignIn, type ITenant } from '../models/master/Tenant.js'
import { getAuditLogModel } from '../models/master/AuditLog.js'
import { sendEmail } from '../services/mailer.js'
import { hostLookupKeys, isPlatformHost, normalizeHostname } from '../lib/hosts.js'

const router = Router()

const SIGNATURE_MAX_AGE_SECONDS = 300
const DB_DEADLINE_MS = 15000
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const RESERVED_SLUGS = new Set([
  'www', 'admin', 'api', 'app', 'mail', 'shop', 'staging', 'seller', 'merchant', 'dashboard',
  'store', 'stores', 'support', 'help', 'billing', 'status', 'docs', 'blog', 'cdn', 'assets',
])

// Comma-separated so a new secret can be added before the old one is removed (zero-downtime rotation).
function signingSecrets(): string[] {
  return (process.env.SIGNUP_SIGNING_SECRETS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function hasValidSignature(req: Request, rawBody: string, secrets: string[]): boolean {
  const timestamp = req.get('x-orvexa-timestamp') || ''
  const given = Buffer.from(req.get('x-orvexa-signature') || '')
  if (!/^\d+$/.test(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_MAX_AGE_SECONDS) return false

  return secrets.some((secret) => {
    const expected = Buffer.from(
      'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
    )
    return expected.length === given.length && crypto.timingSafeEqual(expected, given)
  })
}

async function masterDbWithinDeadline(): Promise<Connection> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Master DB did not respond in time')), DB_DEADLINE_MS)
  })
  try {
    return await Promise.race([connectMasterDatabase(), deadline])
  } finally {
    clearTimeout(timer)
  }
}

type SlugCheck = NonNullable<IApplication['slugCheck']>

async function checkSlug(db: Connection, slug: string): Promise<SlugCheck> {
  if (!SLUG_PATTERN.test(slug)) return { available: false, reason: 'invalid' }
  if (RESERVED_SLUGS.has(slug)) return { available: false, reason: 'reserved' }
  if (await getTenantModel(db).exists({ slug })) return { available: false, reason: 'taken' }
  const requested = await getApplicationModel(db).exists({
    requestedSubdomain: slug,
    status: { $in: ['pending', 'needs_info', 'approved'] },
  })
  if (requested) return { available: false, reason: 'requested' }
  return { available: true }
}

// Maps the website's free-text niche onto the store-type presets in src/data/store-niches.ts.
const NICHE_KEYWORDS: [string, RegExp][] = [
  ['handloom', /handloom|artisan|traditional|khadi|saree/],
  ['fashion', /fashion|apparel|cloth|wear/],
  ['jewelry', /jewel|accessor/],
  ['beauty', /beauty|cosmetic|skin/],
  ['home', /home|decor|furniture/],
  ['electronics', /electronic|gadget/],
  ['food', /food|wellness|grocery|snack/],
  ['books', /book|stationer/],
  ['sports', /sport|fitness/],
  ['toys', /toy|game|kid/],
  ['pets', /pet/],
]

function storeTypeFor(niche: string): string {
  const text = niche.toLowerCase()
  return NICHE_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] || 'other'
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function publicTenant(t: ITenant) {
  return {
    id: t.id,
    slug: t.slug,
    brandName: t.brandName,
    ownerName: t.ownerName,
    ownerEmail: t.ownerEmail,
    ownerPhone: t.ownerPhone,
    logo: t.logo || '',
    status: t.status,
    plan: t.plan,
    customDomain: t.customDomain || '',
    customDomainVerified: Boolean(t.customDomainVerified),
    storeType: t.storeType || '',
    niche: t.niche || '',
    categories: t.categories || [],
    theme: t.theme,
    subscription: t.subscription,
    createdAt: t.createdAt,
    portalPath: `/t/${t.slug}`,
    dashboardPath: `/t/${t.slug}/dashboard`,
  }
}

/** Unsigned: the storefront needs this before anyone is signed in. */
router.get('/resolve', async (req: Request, res: Response) => {
  try {
    const db = await masterDbWithinDeadline()
    const Tenant = getTenantModel(db)
    const slug = str(req.query.slug).toLowerCase()
    const host = normalizeHostname(str(req.query.host) || req.get('x-forwarded-host') || req.hostname || '')

    let tenant = slug && SLUG_PATTERN.test(slug) ? await Tenant.findOne({ slug }) : null
    if (!tenant && host && !isPlatformHost(host)) {
      tenant = await Tenant.findOne({ customDomain: { $in: hostLookupKeys(host) } })
    }
    if (!tenant && host && isPlatformHost(host)) {
      const sub = host.split('.')[0]
      if (sub && SLUG_PATTERN.test(sub) && !RESERVED_SLUGS.has(sub) && host !== PLATFORM_ROOT_DOMAIN) {
        tenant = await Tenant.findOne({ slug: sub })
      }
    }

    if (!tenant) {
      res.status(404).json({ error: 'Store not found.' })
      return
    }
    if (tenant.status === 'cancelled' || tenant.status === 'pending' || tenant.status === 'suspended') {
      res.status(403).json({ error: 'This store is not available.', status: tenant.status })
      return
    }
    res.json(publicTenant(tenant))
  } catch (err: any) {
    console.error('[Resolve] Failed:', err.message)
    res.status(503).json({ error: 'Temporarily unavailable' })
  }
})

const OWNER_LOGIN_KEY = /^[A-Za-z0-9_-]{16,80}$/
const OWNER_LOGIN_MISSING = { error: 'Store owner login link is not available.' }

/** Unsigned lookup for a dedicated store-owner login link. Returns branding only. */
router.get('/owner-login/:key', async (req: Request, res: Response) => {
  try {
    const key = str(req.params.key)
    if (!OWNER_LOGIN_KEY.test(key)) {
      res.status(404).json(OWNER_LOGIN_MISSING)
      return
    }
    const db = await masterDbWithinDeadline()
    const tenant = await getTenantModel(db).findOne({ ownerLoginKey: key, ownerLoginRevoked: { $ne: true } })
    if (!tenant || !tenantAllowsSignIn(tenant.status)) {
      res.status(404).json(OWNER_LOGIN_MISSING)
      return
    }
    res.json({ brandName: tenant.brandName, slug: tenant.slug })
  } catch (err: any) {
    console.error('[Owner login] Failed:', err.message)
    res.status(503).json({ error: 'Temporarily unavailable' })
  }
})


function findProblem(p: any): string | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'body must be a JSON object'
  if (p.schemaVersion !== 1) return 'unsupported schemaVersion'
  if (!str(p.idempotencyKey)) return 'idempotencyKey is required'
  if (!str(p.owner?.email) || !EMAIL_PATTERN.test(str(p.owner.email))) return 'owner.email is required'
  if (str(p.brand?.name).length < 2) return 'brand.name is required'
  if (!str(p.brand?.requestedSlug)) return 'brand.requestedSlug is required'
  return null
}

function connectorStatus(status: IApplication['status']): string {
  if (status === 'waitlist') return 'early_access'
  if (status === 'rejected') return 'declined'
  if (status === 'approved') return 'approved'
  return 'pending_review'
}

const SLUG_CLASH_TEXT: Record<string, string> = {
  invalid: 'is not a valid store address',
  reserved: 'is reserved by Orvexa Cloud',
  taken: 'is already used by another store',
  requested: 'has already been requested by another applicant',
}

async function afterSignupReceived(db: Connection, app: IApplication, req: Request): Promise<void> {
  const isWaitlist = app.status === 'waitlist'
  await getAuditLogModel(db).create({
    id: `log_${crypto.randomUUID()}`,
    actorId: 'marketing_site_connector',
    actorName: 'Website Signup Connector',
    actorRole: 'system',
    tenantSlug: app.requestedSubdomain,
    tenantName: app.brandName,
    action: isWaitlist ? 'EARLY_ACCESS_SIGNUP_RECEIVED' : 'STORE_APPLICATION_RECEIVED',
    category: 'provisioning',
    severity: app.slugCheck?.available === false ? 'warning' : 'info',
    details: isWaitlist
      ? `Early-access waitlist entry for "${app.brandName}" (${app.launch?.country || 'unknown country'}).`
      : `Website application received for "${app.brandName}" on the ${app.requestedPlan?.name || app.requestedPlan?.id || 'starter'} plan.`,
    ipAddress: req.ip || '',
    userAgent: req.get('user-agent') || '',
    metadata: { applicationId: app.id, slugCheck: app.slugCheck, migration: Boolean(app.migration?.from) },
  })

  // Team alert carries no owner contact details; staff open the application in the admin portal.
  const teamInbox = process.env.SIGNUP_NOTIFY_EMAIL
  if (teamInbox) {
    await sendEmail({
      to: teamInbox,
      subject: `${isWaitlist ? 'Early-access signup' : 'New store application'}: ${app.brandName}`,
      idempotencyKey: `team-${app.id}`,
      text: [
        `Reference: ${app.id}`,
        `Plan: ${app.requestedPlan?.name || app.requestedPlan?.id || 'starter'} (${app.requestedPlan?.cycle || 'monthly'})`,
        `Country: ${app.launch?.country || 'unknown'}`,
        `Store address: ${app.requestedSubdomain}.${PLATFORM_ROOT_DOMAIN}${app.slugCheck?.available === false ? ` (${app.slugCheck.reason}, owner emailed)` : ''}`,
        ...(app.migration?.from ? [`Migration task: from ${app.migration.from}${app.migration.currentDomain ? ` (${app.migration.currentDomain})` : ''}`] : []),
        '',
        'Review it in the admin portal under Applications.',
      ].join('\n'),
    })
  }

  // The website has already sent the "we received your application" receipt; only a slug clash needs mail now.
  if (!isWaitlist && app.slugCheck?.available === false) {
    const reason = SLUG_CLASH_TEXT[app.slugCheck.reason || 'taken']
    await sendEmail({
      to: app.ownerEmail,
      subject: `Choose another store address for ${app.brandName}`,
      idempotencyKey: `slug-clash-${app.id}`,
      text: [
        `Hi ${app.ownerName || 'there'},`,
        '',
        `Thanks for applying to Orvexa Cloud. The store address you asked for, ${app.requestedSubdomain}.${PLATFORM_ROOT_DOMAIN}, ${reason}.`,
        'Your application is safe and still in review. Just reply to this email with two or three other addresses you would be happy with, and we will reserve one for you.',
        '',
        `Your reference: ${app.id}`,
        '',
        'The Orvexa Cloud team',
      ].join('\n'),
    })
  }
}

router.post('/signups', raw({ type: '*/*', limit: '256kb' }), async (req: Request, res: Response) => {
  const secrets = signingSecrets()
  if (secrets.length === 0) {
    console.error('[Signups] SIGNUP_SIGNING_SECRETS is not set; refusing signups until it is configured')
    res.status(503).json({ error: 'Signup intake is not configured yet' })
    return
  }
  if (!Buffer.isBuffer(req.body)) {
    // Another body parser consumed the stream, so the signature cannot be checked. Ask for a retry.
    console.error('[Signups] Raw request body unavailable; check middleware order')
    res.status(503).json({ error: 'Temporarily unavailable' })
    return
  }

  const rawBody = req.body.toString('utf8')
  if (!hasValidSignature(req, rawBody, secrets)) {
    console.warn(`[Signups] Rejected signature from ${req.ip}`)
    res.status(401).json({ error: 'bad signature' })
    return
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    res.status(400).json({ error: 'invalid json' })
    return
  }
  const problem = findProblem(payload)
  if (problem) {
    res.status(422).json({ error: problem })
    return
  }
  const idempotencyKey = str(payload.idempotencyKey)
  const headerKey = req.get('idempotency-key')
  if (headerKey && headerKey !== idempotencyKey) {
    res.status(422).json({ error: 'Idempotency-Key header does not match idempotencyKey' })
    return
  }

  try {
    const db = await masterDbWithinDeadline()
    const Application = getApplicationModel(db)

    const previous = await Application.findOne({ idempotencyKey })
    if (previous) {
      res.status(409).json({ applicationId: previous.id, status: connectorStatus(previous.status) })
      return
    }

    const slug = str(payload.brand.requestedSlug).toLowerCase()
    const niche = str(payload.brand.niche)
    const plan = payload.plan || {}
    const isWaitlist = payload.launch?.status === 'early_access'
    const migrationFrom = str(payload.migration?.from)
    const migrationDomain = str(payload.migration?.currentDomain)

    const doc = {
      id: `app_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      channel: 'website' as const,
      idempotencyKey,
      brandName: str(payload.brand.name).slice(0, 60),
      ownerName: str(payload.owner.name),
      ownerEmail: str(payload.owner.email).toLowerCase(),
      ownerPhone: str(payload.owner.phone),
      category: niche,
      storeType: storeTypeFor(niche),
      categories: [],
      description: migrationFrom ? `Migrating from ${migrationFrom}${migrationDomain ? ` (${migrationDomain})` : ''}` : '',
      requestedSubdomain: slug,
      status: isWaitlist ? ('waitlist' as const) : ('pending' as const),
      submittedAt: str(payload.submittedAt) || new Date().toISOString(),
      requestedPlan: {
        id: str(plan.id) || 'starter',
        name: str(plan.name) || undefined,
        cycle: plan.cycle === 'yearly' ? ('yearly' as const) : ('monthly' as const),
        region: str(plan.region) || undefined,
        currency: str(plan.currency) || undefined,
        amountExTax: typeof plan.amountExTax === 'number' ? plan.amountExTax : undefined,
        tax: typeof plan.tax === 'number' ? plan.tax : undefined,
        total: typeof plan.total === 'number' ? plan.total : undefined,
        totalMinor: Number.isInteger(plan.totalMinor) ? plan.totalMinor : undefined,
        trialDays: Number.isInteger(plan.trialDays) ? plan.trialDays : undefined,
      },
      launch: {
        status: isWaitlist ? ('early_access' as const) : ('live' as const),
        country: str(payload.launch?.country),
      },
      migration: migrationFrom || migrationDomain ? { from: migrationFrom || null, currentDomain: migrationDomain || null } : null,
      consents: {
        marketing: payload.consents?.marketing === true,
        termsAcceptedAt: str(payload.consents?.termsAcceptedAt),
        termsVersion: payload.consents?.termsVersion ?? null,
        ip: str(payload.source?.ip) || undefined,
        userAgent: str(payload.source?.userAgent) || undefined,
      },
      attribution: {
        site: str(payload.source?.site) || undefined,
        country: str(payload.source?.country) || undefined,
        referrer: str(payload.source?.referrer) || undefined,
        utm: payload.source?.utm && typeof payload.source.utm === 'object' ? payload.source.utm : {},
      },
      billing: payload.billing ?? null,
      slugCheck: await checkSlug(db, slug),
    }

    let created: IApplication
    try {
      created = await Application.create(doc)
    } catch (err: any) {
      // A concurrent retry with the same key won the insert; answer with its id instead of a second application.
      if (err?.code === 11000) {
        const winner = await Application.findOne({ idempotencyKey })
        if (winner) {
          res.status(409).json({ applicationId: winner.id, status: connectorStatus(winner.status) })
          return
        }
      }
      throw err
    }

    res.status(201).json({ applicationId: created.id, status: connectorStatus(created.status) })

    afterSignupReceived(db, created, req).catch((err) =>
      console.error('[Signups] Post-receipt work failed for', created.id, err.message)
    )
  } catch (err: any) {
    console.error('[Signups] Could not store signup:', err.message)
    res.status(503).json({ error: 'Temporarily unavailable, please retry' })
  }
})

router.get('/slug-available', async (req: Request, res: Response) => {
  const secrets = signingSecrets()
  if (secrets.length === 0) {
    res.status(503).json({ error: 'Signup intake is not configured yet' })
    return
  }
  if (!hasValidSignature(req, '', secrets)) {
    res.status(401).json({ error: 'bad signature' })
    return
  }
  try {
    const db = await masterDbWithinDeadline()
    const result = await checkSlug(db, String(req.query.slug || '').trim().toLowerCase())
    res.json({ available: result.available })
  } catch (err: any) {
    console.error('[Signups] Slug check failed:', err.message)
    res.status(503).json({ error: 'Temporarily unavailable' })
  }
})

export default router
