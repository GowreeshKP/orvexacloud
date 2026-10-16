import { Router, type Request, type Response } from 'express'
import { connectMasterDatabase, getTenantConnection } from '../config/db.js'
import { TENANT_STATUSES, getTenantModel, tenantAllowsSignIn } from '../models/master/Tenant.js'
import { getRefreshTokenModel } from '../models/master/RefreshToken.js'
import { getApplicationModel } from '../models/master/Application.js'
import { getAuditLogModel } from '../models/master/AuditLog.js'
import { getTenantOrderModel } from '../models/tenant/Order.js'
import { provisionTenantFolders } from '../services/tenantProvisioner.js'
import { optionalAuth, requireAdmin } from '../middleware/authMiddleware.js'
import {
  EMAIL_PATTERN,
  SLUG_PATTERN,
  ValidationError,
  escapeRegex,
  isPlainObject,
  optString,
  pagination,
  queryString,
  reqString,
} from '../lib/validate.js'
import { PLAN_CATALOG, PLATFORM_ROOT_DOMAIN, TRIAL_DAYS, normalizePlanId, planPricePerMonth } from '../config/plans.js'
import { sendEmail } from '../services/mailer.js'
import { RESERVED_SLUGS } from './publicRoutes.js'
import { issueOwnerPasswordLink, publicAppUrl } from '../services/ownerPasswordLink.js'
import { issueCancellationExport } from '../services/billing.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

const MIN_PASSWORD = 8

/** Reads `key` from an untrusted object as optional / required text. */
function fieldOpt(obj: unknown, key: string, max: number): string | undefined {
  return optString(isPlainObject(obj) ? obj[key] : undefined, key, max)
}
function fieldReq(obj: unknown, key: string, max: number): string {
  return reqString(isPlainObject(obj) ? obj[key] : undefined, key, max)
}

function serverError(res: Response, context: string, err: unknown, message: string) {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message })
    return
  }
  console.error(`[Admin] ${context}:`, err)
  res.status(500).json({ error: message })
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL routes in this router require Super Admin JWT, except write-only event logging.
// ─────────────────────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  // Client apps record events here; identity is taken from the token, never from the body.
  if (req.path === '/audit-logs' && req.method === 'POST') {
    return optionalAuth(req, res, next)
  }
  return requireAdmin(req, res, next)
})

// GET platform analytics overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const Application = getApplicationModel(masterDb)

    const tenants = await Tenant.find().select('slug status plan subscription customMongoUri')
    const pendingApplications = await Application.countDocuments({ status: 'pending' })

    const activeCount = tenants.filter((t) => t.status === 'active').length
    const mrr = tenants
      .filter((t) => t.status === 'active')
      .reduce((sum, t) => sum + (t.subscription?.pricePerMonth ?? PLAN_CATALOG[normalizePlanId(t.plan)].pricePerMonth), 0)

    // Aggregate orders across tenant databases in parallel; totals are computed in Mongo.
    const unreachable: string[] = []
    const perTenant = await Promise.all(
      tenants.map(async (tenant) => {
        try {
          const Order = getTenantOrderModel(await getTenantConnection(tenant.slug, tenant.customMongoUri))
          const [agg] = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            { $group: { _id: null, orders: { $sum: 1 }, gmv: { $sum: '$total' }, customers: { $addToSet: '$shippingAddress.phone' } } },
            { $project: { orders: 1, gmv: 1, customers: { $size: '$customers' } } },
          ])
          return agg || { orders: 0, gmv: 0, customers: 0 }
        } catch {
          unreachable.push(tenant.slug)
          return { orders: 0, gmv: 0, customers: 0 }
        }
      })
    )

    res.json({
      totalGmv: perTenant.reduce((s, t) => s + t.gmv, 0),
      activeStores: activeCount,
      mrr,
      pendingApplications,
      totalOrders: perTenant.reduce((s, t) => s + t.orders, 0),
      totalCustomers: perTenant.reduce((s, t) => s + t.customers, 0),
      tenantsCount: tenants.length,
      unreachableStores: unreachable,
    })
  } catch (err) {
    serverError(res, 'overview', err, 'Failed to fetch platform overview')
  }
})

// GET all tenants
router.get('/tenants', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const tenants = await Tenant.find().sort({ createdAt: -1 })
    res.json(tenants)
  } catch (err) {
    serverError(res, 'list tenants', err, 'Failed to fetch stores')
  }
})

// GET tenant env file content
router.get('/tenants/:slug/env', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase()
    if (!SLUG_PATTERN.test(slug)) {
      res.status(400).json({ error: 'Invalid store slug.' })
      return
    }
    const rootDir = path.resolve(__dirname, '../../../')
    const envPath = path.join(rootDir, 'src', 'tenants', slug, 'tenant.env')

    if (fs.existsSync(envPath)) {
      // Older provisioner versions wrote password material into this file; never return it.
      const content = fs
        .readFileSync(envPath, 'utf-8')
        .split('\n')
        .filter((line) => !/PASSWORD|SECRET|MONGODB_URI/i.test(line))
        .join('\n')
      res.json({
        slug,
        folderPath: `src/tenants/${slug}`,
        envContent: content,
        dbName: `orvexa_tenant_${slug}`,
      })
    } else {
      res.json({
        slug,
        folderPath: `src/tenants/${slug}`,
        envContent: `# Tenant environment for ${slug}\nTENANT_SLUG=${slug}\nMONGODB_DB_NAME=orvexa_tenant_${slug}\nMONGODB_URI=mongodb://localhost:27017/orvexa_tenant_${slug}\nSTORE_PORTAL=${PLATFORM_ROOT_DOMAIN}/t/${slug}\nSELLER_PORTAL=${PLATFORM_ROOT_DOMAIN}/t/${slug}/dashboard`,
        dbName: `orvexa_tenant_${slug}`,
      })
    }
  } catch (err) {
    serverError(res, 'tenant env', err, 'Failed to read tenant environment')
  }
})

function categorySlug(name: string): string {
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// POST create new tenant — admin only. Only whitelisted fields are accepted; password hashes,
// staff accounts, database URIs and ids are never taken from the request body.
router.post('/tenants', requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {}
    const slug = fieldReq(b, 'slug', 30).toLowerCase()
    if (!SLUG_PATTERN.test(slug)) throw new ValidationError('Store address must be 3-30 lower-case letters, digits or hyphens.')
    if (RESERVED_SLUGS.has(slug)) throw new ValidationError(`"${slug}" is reserved by the platform.`)
    const ownerEmail = fieldReq(b, 'ownerEmail', 254).toLowerCase()
    if (!EMAIL_PATTERN.test(ownerEmail)) throw new ValidationError('ownerEmail is not a valid email address.')
    const initialPassword = b.initialPassword
    if (initialPassword !== undefined && initialPassword !== '' && (typeof initialPassword !== 'string' || initialPassword.length < MIN_PASSWORD || initialPassword.length > 200)) {
      throw new ValidationError(`initialPassword must be ${MIN_PASSWORD}-200 characters.`)
    }

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    if (await Tenant.exists({ slug })) {
      res.status(409).json({ error: `The store address "${slug}" is already in use.` })
      return
    }

    const categories = Array.isArray(b.categories)
      ? b.categories
          .map((c: unknown) => (typeof c === 'string' ? c : c && typeof (c as any).name === 'string' ? (c as any).name : ''))
          .map((name: string) => name.trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 50)
          .map((name: string) => ({ id: `cat_${categorySlug(name)}`, name, slug: categorySlug(name), desc: '', image: '' }))
      : []
    const plan = normalizePlanId(b.plan)
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const theme = b.theme && typeof b.theme === 'object' ? b.theme : {}

    const newTenant = new Tenant({
      id: `tenant_${slug}_${Date.now()}`,
      slug,
      brandName: fieldReq(b, 'brandName', 100),
      ownerName: fieldOpt(b, 'ownerName', 100) || ownerEmail.split('@')[0],
      ownerEmail,
      ownerPhone: fieldOpt(b, 'ownerPhone', 20) || '',
      customDomain: fieldOpt(b, 'customDomain', 253)?.toLowerCase() || '',
      status: 'active',
      plan,
      storeType: fieldOpt(b, 'storeType', 40) || 'other',
      niche: fieldOpt(b, 'niche', 100) || '',
      categories,
      subscription: {
        plan,
        pricePerMonth: PLAN_CATALOG[plan].pricePerMonth,
        status: 'trial',
        trialEndsAt: trialEnds,
        nextBillingDate: trialEnds,
        paymentMethod: 'razorpay',
        invoices: [],
      },
      theme: {
        primaryColor: fieldOpt(theme, 'primaryColor', 20),
        accentColor: fieldOpt(theme, 'accentColor', 20),
        heroHeadline: fieldOpt(theme, 'heroHeadline', 200),
        heroSubhead: fieldOpt(theme, 'heroSubhead', 500),
      },
    })
    const saved = await newTenant.save()

    // Provision dedicated client folder, .env, and initial hashed password
    try {
      const provisionResult = await provisionTenantFolders({
        slug: saved.slug,
        brandName: saved.brandName,
        ownerName: saved.ownerName,
        ownerEmail: saved.ownerEmail,
        ownerPhone: saved.ownerPhone,
        customDomain: saved.customDomain,
        initialPassword: initialPassword || undefined,
        plan,
      })
      // Persist hashed password back to the tenant document
      if (provisionResult.passwordHash) {
        await Tenant.findOneAndUpdate(
          { slug: saved.slug },
          { $set: { passwordHash: provisionResult.passwordHash } }
        )
      }
    } catch (provisionErr) {
      console.warn('[Tenant Provisioner Warning]', provisionErr)
    }

    res.status(201).json(saved)
  } catch (err) {
    serverError(res, 'create tenant', err, 'Failed to create tenant store')
  }
})

// PUT update tenant status — admin only. Suspending a store also ends all its sessions.
router.put('/tenants/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.body?.status
    if (!TENANT_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${TENANT_STATUSES.join(', ')}` })
      return
    }
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const updated = await Tenant.findOneAndUpdate(
      { id: String(req.params.id) },
      { $set: { status, 'subscription.billingManaged': false } },
      { new: true }
    )
    if (!updated) {
      res.status(404).json({ error: 'Tenant not found' })
      return
    }
    if (!tenantAllowsSignIn(status)) {
      await getRefreshTokenModel(masterDb).deleteMany({ tenantSlug: updated.slug })
    }
    if (status === 'cancelled') {
      issueCancellationExport(updated).catch((err) => console.error('[billing] export email failed', err.message))
    }
    res.json(updated)
  } catch (err) {
    serverError(res, 'tenant status', err, 'Failed to update tenant status')
  }
})

// GET all applications
router.get('/applications', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Application = getApplicationModel(masterDb)
    const applications = await Application.find().sort({ createdAt: -1 })
    res.json(applications)
  } catch (err) {
    serverError(res, 'list applications', err, 'Failed to fetch applications')
  }
})

// PUT update application status (approve / reject) — admin only
// Body: { status: 'approved' | 'rejected' | 'needs_info', reviewNotes?, slug? } — `slug` replaces a
// clashing store address; 'needs_info' requires reviewNotes, which are emailed as the question.
router.put('/applications/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.body ?? {}
    const reviewNotes = fieldOpt(req.body ?? {}, 'reviewNotes', 2000)
    if (status !== 'approved' && status !== 'rejected' && status !== 'needs_info') {
      res.status(400).json({ error: "status must be 'approved', 'rejected' or 'needs_info'" })
      return
    }
    if (status === 'needs_info' && !reviewNotes) {
      res.status(400).json({ error: 'reviewNotes must say what information is needed.' })
      return
    }
    const masterDb = await connectMasterDatabase()
    const Application = getApplicationModel(masterDb)
    const Tenant = getTenantModel(masterDb)

    const application = await Application.findOne({ id: String(req.params.id) })
    if (!application) {
      res.status(404).json({ error: 'Application not found' })
      return
    }
    if (application.status === 'approved') {
      res.status(409).json({ error: 'This application has already been approved.' })
      return
    }
    if (status !== 'rejected' && application.status === 'waitlist') {
      res.status(409).json({ error: 'Early-access entries cannot be provisioned until their country launches.' })
      return
    }

    const slug = String(fieldOpt(req.body, 'slug', 30) || application.requestedSubdomain).trim().toLowerCase()
    if (status === 'approved') {
      if (!SLUG_PATTERN.test(slug)) {
        res.status(400).json({ error: 'Store address must be 3-30 lower-case letters, digits or hyphens.' })
        return
      }
      if (await Tenant.exists({ slug })) {
        res.status(409).json({ error: `The store address "${slug}" is already in use. Approve with a different slug.` })
        return
      }
    }

    // Conditional on the current status so two concurrent approvals cannot both provision.
    const updated = await Application.findOneAndUpdate(
      { id: application.id, status: { $ne: 'approved' } },
      {
        $set: {
          status,
          reviewNotes,
          requestedSubdomain: slug,
          reviewedAt: new Date().toISOString(),
          ...(status === 'approved' ? { slugCheck: { available: true } } : {}),
        },
      },
      { new: true }
    )
    if (!updated) {
      res.status(409).json({ error: 'This application has already been approved.' })
      return
    }

    let passwordLink: { url: string; expiresAt: Date } | null = null

    // If approved, automatically provision new tenant in Master DB and create dedicated client folder
    if (status === 'approved') {
      const plan = normalizePlanId(updated.requestedPlan?.id)
      const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const newTenant = new Tenant({
        id: `tenant_${updated.requestedSubdomain}_${Date.now()}`,
        slug: updated.requestedSubdomain,
        brandName: updated.brandName,
        ownerName: updated.ownerName || updated.ownerEmail.split('@')[0],
        ownerEmail: updated.ownerEmail,
        ownerPhone: updated.ownerPhone,
        status: 'active',
        plan,
        subscription: {
          plan,
          cycle: updated.requestedPlan?.cycle === 'yearly' ? 'yearly' : 'monthly',
          // Recomputed from our own catalogue; the price in the signup payload is never trusted.
          pricePerMonth: planPricePerMonth(plan, updated.requestedPlan?.cycle === 'yearly' ? 'yearly' : 'monthly'),
          status: 'trial',
          trialEndsAt: trialEnds,
          nextBillingDate: trialEnds,
          paymentMethod: 'razorpay',
          invoices: [],
        },
        storeType: updated.storeType || 'other',
        niche: updated.category,
        categories: Array.from(
          new Map(
            (updated.categories || [])
              .map((name) => name.trim())
              .filter(Boolean)
              .map((name) => {
                const slug = name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                return [slug, { id: `cat_${slug}`, name, slug, desc: '', image: '' }] as const
              })
          ).values()
        ),
        theme: {
          primaryColor: '#1F2937',
          accentColor: '#6B7280',
          backgroundColor: '#FAFAF8',
          fontDisplay: "'Instrument Serif', Georgia, serif",
          fontSans: "'Work Sans', system-ui, sans-serif",
          heroImage: '',
          heroHeadline: updated.brandName,
          heroSubhead: updated.channel === 'website' ? '' : updated.description,
          heroCtaText: 'SHOP NOW →',
          announcementMessages: [`WELCOME TO ${updated.brandName.toUpperCase()}`],
        },
      })
      await newTenant.save()

      // Automatically create dedicated store folder & isolated database config file
      try {
        const provisionResult = await provisionTenantFolders({
          slug: updated.requestedSubdomain,
          brandName: updated.brandName,
          ownerName: updated.ownerName,
          ownerEmail: updated.ownerEmail,
          ownerPhone: updated.ownerPhone,
          description: updated.channel === 'website' ? '' : updated.description,
          plan,
        })
        // Persist hashed password to the tenant record
        if (provisionResult.passwordHash) {
          const Tenant2 = getTenantModel(masterDb)
          await Tenant2.findOneAndUpdate(
            { slug: updated.requestedSubdomain },
            { $set: { passwordHash: provisionResult.passwordHash } }
          )
        }
      } catch (provisionErr) {
        console.warn('[Tenant Provisioner Warning on Approval]', provisionErr)
      }

      passwordLink = await issueOwnerPasswordLink(
        masterDb,
        updated.requestedSubdomain,
        publicAppUrl(req.headers.origin),
        7 * 24 * 60 * 60 * 1000
      )
    }

    res.json(updated)

    sendApplicationDecision(updated, passwordLink).catch((err) =>
      console.error('[Applications] Decision email failed for', updated.id, err.message)
    )
  } catch (err) {
    serverError(res, 'application status', err, 'Failed to update application')
  }
})

// POST /api/admin/waitlist/notify — admin only. Body: { country: 'AE' }
// Emails each early-access entry for that country (once) that signups are open. Run it after the
// country has been added to the website's LAUNCHED_COUNTRIES, so a new signup counts as live.
router.post('/waitlist/notify', requireAdmin, async (req: Request, res: Response) => {
  try {
    const country = String(req.body?.country || '').trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(country)) {
      res.status(400).json({ error: 'country must be a two-letter country code, e.g. AE.' })
      return
    }
    const masterDb = await connectMasterDatabase()
    const Application = getApplicationModel(masterDb)
    const entries = await Application.find({
      status: 'waitlist',
      'launch.country': country,
      launchNotifiedAt: { $in: [null, ''] },
    }).limit(500)

    let notified = 0
    let failed = 0
    for (const entry of entries) {
      const sent = await sendEmail({
        to: entry.ownerEmail,
        subject: `Orvexa Cloud is now open in your country`,
        idempotencyKey: `launch-${entry.id}`,
        text: [
          `Hi ${entry.ownerName || 'there'},`,
          '',
          `You joined the Orvexa Cloud early-access list for ${entry.brandName}. Good news: we are now open in your country.`,
          '',
          'To open your store, complete a new sign-up on our website. Your 30-day free trial starts when your store is approved, and nothing is charged before it ends.',
          '',
          `Your early-access reference: ${entry.id}`,
          '',
          'The Orvexa Cloud team',
        ].join('\n'),
      })
      if (sent) {
        notified++
        await Application.updateOne({ id: entry.id }, { $set: { launchNotifiedAt: new Date().toISOString() } })
      } else {
        failed++
      }
    }

    await getAuditLogModel(masterDb).create({
      id: `log_${crypto.randomUUID()}`,
      actorId: req.authUser!.userId,
      actorName: req.authUser!.email,
      actorRole: 'super_admin',
      action: 'EARLY_ACCESS_COUNTRY_NOTIFIED',
      category: 'provisioning',
      severity: failed ? 'warning' : 'info',
      details: `Early-access list for ${country}: ${notified} notified, ${failed} not sent.`,
      ipAddress: req.ip || '',
      userAgent: req.get('user-agent') || '',
    })

    // Batches of 500; call again while hasMore is true.
    res.json({ country, notified, failed, hasMore: entries.length === 500 })
  } catch (err) {
    serverError(res, 'waitlist notify', err, 'Failed to notify the early-access list')
  }
})

async function sendApplicationDecision(
  app: { id: string; brandName: string; ownerName: string; ownerEmail: string; requestedSubdomain: string; status: string; reviewNotes?: string; requestedPlan?: { id?: string } },
  passwordLink: { url: string; expiresAt: Date } | null
): Promise<void> {
  const greeting = `Hi ${app.ownerName || 'there'},`
  if (app.status === 'approved' && passwordLink) {
    const plan = PLAN_CATALOG[normalizePlanId(app.requestedPlan?.id)]
    await sendEmail({
      to: app.ownerEmail,
      subject: `${app.brandName} is approved on Orvexa Cloud`,
      idempotencyKey: `decision-${app.id}-approved`,
      text: [
        greeting,
        '',
        `Good news: ${app.brandName} is approved and your store is ready at https://${app.requestedSubdomain}.${PLATFORM_ROOT_DOMAIN}.`,
        '',
        'Set your password to sign in (this link works once and expires in 7 days):',
        passwordLink.url,
        '',
        `Your ${TRIAL_DAYS}-day free trial of ${plan.label} starts today. Nothing is charged before it ends, and you can cancel any time before then.`,
        '',
        `Reference: ${app.id}`,
        '',
        'The Orvexa Cloud team',
      ].join('\n'),
    })
  } else if (app.status === 'needs_info') {
    const noteKey = crypto.createHash('sha256').update(app.reviewNotes || '').digest('hex').slice(0, 12)
    await sendEmail({
      to: app.ownerEmail,
      subject: `A quick question about your ${app.brandName} application`,
      idempotencyKey: `decision-${app.id}-needs_info-${noteKey}`,
      text: [
        greeting,
        '',
        `Thanks for applying to Orvexa Cloud. Before we can open ${app.brandName}, we need a little more information:`,
        '',
        app.reviewNotes || '',
        '',
        'Just reply to this email with the details and we will pick your application straight back up.',
        '',
        `Reference: ${app.id}`,
        '',
        'The Orvexa Cloud team',
      ].join('\n'),
    })
  } else if (app.status === 'rejected') {
    await sendEmail({
      to: app.ownerEmail,
      subject: `Your Orvexa Cloud application for ${app.brandName}`,
      idempotencyKey: `decision-${app.id}-rejected`,
      text: [
        greeting,
        '',
        `Thank you for applying to Orvexa Cloud. We are not able to open ${app.brandName} on the platform at this time.`,
        ...(app.reviewNotes ? ['', app.reviewNotes] : []),
        '',
        'If anything changes, or you think we got this wrong, just reply to this email.',
        '',
        `Reference: ${app.id}`,
        '',
        'The Orvexa Cloud team',
      ].join('\n'),
    })
  }
}

// ─────────────────────────────────────────────────────────
// GET /api/admin/tenants/:slug/staff
// List all staff members for a specific store
// ─────────────────────────────────────────────────────────
router.get('/tenants/:slug/staff', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase() })

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' })
      return
    }

    // Return staff without exposing passwordHash
    const staff = tenant.staffMembers.map(({ id, name, email, role, createdAt }) => ({
      id,
      name,
      email,
      role,
      createdAt,
    }))

    res.json({ tenantSlug: tenant.slug, staff })
  } catch (err) {
    serverError(res, 'list staff', err, 'Failed to fetch staff')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/admin/tenants/:slug/staff
// Create a staff account for a specific store
// Body: { name, email, password, role? }
// ─────────────────────────────────────────────────────────
router.post('/tenants/:slug/staff', async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {}
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 100) : ''
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    const password = typeof b.password === 'string' ? b.password : ''
    const role = b.role ?? 'staff'

    if (!name || !EMAIL_PATTERN.test(email) || password.length < MIN_PASSWORD || password.length > 200) {
      res.status(400).json({ error: 'name, a valid email, and password (8-200 chars) are required.' })
      return
    }

    if (!['staff', 'manager'].includes(role)) {
      res.status(400).json({ error: 'role must be "staff" or "manager".' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase() })

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' })
      return
    }

    // Staff log in by email alone, so an address may belong to only one account platform-wide.
    if ((await Tenant.exists({ $or: [{ 'staffMembers.email': email }, { ownerEmail: email }] }))) {
      res.status(409).json({ error: 'This email is already used by another account.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const newStaff = {
      id: `staff_${crypto.randomBytes(6).toString('hex')}`,
      name,
      email,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    }

    await Tenant.findOneAndUpdate(
      { slug: tenant.slug },
      { $push: { staffMembers: newStaff } }
    )

    res.status(201).json({
      success: true,
      staff: { id: newStaff.id, name: newStaff.name, email: newStaff.email, role: newStaff.role, createdAt: newStaff.createdAt },
    })
  } catch (err) {
    serverError(res, 'create staff', err, 'Failed to create staff member')
  }
})

// ─────────────────────────────────────────────────────────
// GET /api/admin/tenants/:slug/credentials
// Get store credentials and access summary for a tenant
// ─────────────────────────────────────────────────────────
router.get('/tenants/:slug/credentials', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase() })

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' })
      return
    }

    res.json({
      id: tenant.id,
      slug: tenant.slug,
      brandName: tenant.brandName,
      ownerName: tenant.ownerName,
      ownerEmail: tenant.ownerEmail,
      ownerPhone: tenant.ownerPhone,
      hasPassword: !!tenant.passwordHash,
      status: tenant.status,
      staffCount: tenant.staffMembers?.length || 0,
      subdomain: `${PLATFORM_ROOT_DOMAIN}/t/${tenant.slug}`,
      customDomain: tenant.customDomain || null,
      customDomainVerified: Boolean(tenant.customDomainVerified),
      dashboardUrl: `/t/${tenant.slug}/dashboard`,
      storefrontUrl: `/t/${tenant.slug}`,
    })
  } catch (err) {
    serverError(res, 'credentials', err, 'Failed to fetch credentials')
  }
})

// ─────────────────────────────────────────────────────────
// PUT /api/admin/tenants/:slug/credentials
// Super admin update store owner credentials (email, name, password, slug)
// Body: { ownerEmail?, ownerName?, ownerPhone?, newPassword?, newSlug? }
// ─────────────────────────────────────────────────────────
router.put('/tenants/:slug/credentials', async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {}
    const ownerEmail = fieldOpt(b, 'ownerEmail', 254)?.toLowerCase()
    const ownerName = fieldOpt(b, 'ownerName', 100)
    const ownerPhone = fieldOpt(b, 'ownerPhone', 20)
    const newPassword = b.newPassword
    const newSlug = fieldOpt(b, 'newSlug', 60)?.toLowerCase()
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const currentSlug = String(req.params.slug).toLowerCase()

    const tenant = await Tenant.findOne({ slug: currentSlug })
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' })
      return
    }

    // The store database is named after the slug, so renaming would orphan all products and orders.
    if (newSlug && newSlug !== currentSlug) {
      res.status(400).json({ error: 'The store address cannot be changed after provisioning. Add a custom domain instead.' })
      return
    }

    const updates: Record<string, unknown> = {}

    if (ownerEmail) {
      if (!EMAIL_PATTERN.test(ownerEmail)) {
        res.status(400).json({ error: 'ownerEmail is not a valid email address.' })
        return
      }
      if (ownerEmail !== tenant.ownerEmail && (await Tenant.exists({ $or: [{ ownerEmail }, { 'staffMembers.email': ownerEmail }] }))) {
        res.status(409).json({ error: 'This email is already used by another account.' })
        return
      }
      updates.ownerEmail = ownerEmail
    }
    if (ownerName) updates.ownerName = ownerName
    if (ownerPhone !== undefined) updates.ownerPhone = ownerPhone
    if (newPassword !== undefined && newPassword !== '') {
      if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD || newPassword.length > 200) {
        res.status(400).json({ error: `Password must be ${MIN_PASSWORD}-200 characters.` })
        return
      }
      updates.passwordHash = await bcrypt.hash(newPassword, 12)
      updates.passwordResetPending = false
      updates.passwordChangedAt = new Date()
    }

    const updated = await Tenant.findOneAndUpdate({ slug: currentSlug }, { $set: updates }, { new: true })
    if (updates.passwordHash || updates.ownerEmail) {
      await getRefreshTokenModel(masterDb).deleteMany({ userId: `usr_${currentSlug}` })
    }

    res.json({
      success: true,
      message: `Authentication credentials updated for "${updated?.brandName}".`,
      tenant: {
        id: updated?.id,
        slug: updated?.slug,
        brandName: updated?.brandName,
        ownerName: updated?.ownerName,
        ownerEmail: updated?.ownerEmail,
        ownerPhone: updated?.ownerPhone,
      },
    })
  } catch (err) {
    serverError(res, 'update credentials', err, 'Failed to update credentials')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/admin/tenants/:slug/trigger-password-reset
// Super admin initiates password reset for store owner:
// 1. Immediately invalidates old password
// 2. Revokes existing active refresh tokens
// 3. Generates cryptographically secure reset token (60 min expiry)
// 4. Dispatches reset link
// ─────────────────────────────────────────────────────────
router.post('/tenants/:slug/trigger-password-reset', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const RefreshToken = getRefreshTokenModel(masterDb)
    const currentSlug = String(req.params.slug).toLowerCase()

    const tenant = await Tenant.findOne({ slug: currentSlug })
    if (!tenant) {
      res.status(404).json({ error: 'Tenant store not found.' })
      return
    }

    // 1. Generate secure reset token
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    // 2. Invalidate old password immediately so old password can NEVER log in
    const revokedHash = `$2a$12$REVOKED_RESET_${crypto.randomBytes(16).toString('hex')}`
    await Tenant.findOneAndUpdate(
      { slug: currentSlug },
      {
        $set: {
          passwordHash: revokedHash,
          passwordResetPending: true,
          passwordResetRequestedAt: new Date().toISOString(),
          passwordChangedAt: new Date(),
        },
      }
    )

    // 3. Purge all existing sessions and pending reset tokens for this tenant
    await RefreshToken.deleteMany({
      $or: [
        { userId: `reset_${currentSlug}` },
        { userId: `usr_${currentSlug}` },
        { tenantSlug: currentSlug },
      ],
    })

    // 4. Save new hashed reset token (valid for 60 minutes)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await new RefreshToken({
      tokenHash,
      userId: `reset_${currentSlug}`,
      role: 'seller',
      tenantSlug: currentSlug,
      expiresAt,
    }).save()

    // The link is returned to the (already all-powerful) super admin for manual handover and
    // emailed to the owner. It is never written to logs.
    const resetUrl = `${publicAppUrl(req.headers.origin)}/?reset_token=${rawToken}&slug=${currentSlug}`
    const emailed = await sendEmail({
      to: tenant.ownerEmail,
      subject: `Set a new password for ${tenant.brandName}`,
      text: [
        `Hi ${tenant.ownerName || 'there'},`,
        '',
        'An Orvexa Cloud administrator reset the password for your store. Choose a new one within 60 minutes:',
        resetUrl,
        '',
        'The Orvexa Cloud team',
      ].join('\n'),
    })

    res.json({
      success: true,
      message: emailed
        ? `Password reset email sent to ${tenant.ownerEmail}. The previous password no longer works.`
        : 'The previous password no longer works. The reset email could not be sent; share the link below securely.',
      emailed,
      ownerEmail: tenant.ownerEmail,
      brandName: tenant.brandName,
      resetToken: rawToken,
      resetUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err) {
    serverError(res, 'trigger reset', err, 'Failed to trigger password reset')
  }
})


// ─────────────────────────────────────────────────────────
// DELETE /api/admin/tenants/:slug/staff/:staffId
// Remove a staff member from a store
// ─────────────────────────────────────────────────────────
router.delete('/tenants/:slug/staff/:staffId', async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const result = await Tenant.findOneAndUpdate(
      { slug: String(req.params.slug).toLowerCase() },
      { $pull: { staffMembers: { id: String(req.params.staffId) } } },
      { new: true }
    )

    if (!result) {
      res.status(404).json({ error: 'Tenant not found.' })
      return
    }
    await getRefreshTokenModel(masterDb).deleteMany({ userId: String(req.params.staffId), tenantSlug: result.slug })

    res.json({ success: true, message: 'Staff member removed.' })
  } catch (err) {
    serverError(res, 'remove staff', err, 'Failed to remove staff member')
  }
})

// ─────────────────────────────────────────────────────────
// GET /api/admin/audit-logs
// Get platform and store audit logs with filtering
// Query: { tenantSlug?, category?, severity?, search?, limit?, page? }
// ─────────────────────────────────────────────────────────
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const tenantSlug = queryString(req.query.tenantSlug)
    const category = queryString(req.query.category)
    const severity = queryString(req.query.severity)
    const search = queryString(req.query.search)?.trim().slice(0, 100)
    const masterDb = await connectMasterDatabase()
    const AuditLog = getAuditLogModel(masterDb)

    const query: Record<string, unknown> = {}

    if (tenantSlug && tenantSlug !== 'all') query.tenantSlug = tenantSlug.toLowerCase()
    if (category && category !== 'all') query.category = category
    if (severity && severity !== 'all') query.severity = severity
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' }
      query.$or = [{ action: rx }, { details: rx }, { actorName: rx }, { tenantSlug: rx }]
    }

    const { limit: pageSize, page, skip } = pagination(req.query, 50, 100)

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1, createdAt: -1 }).skip(skip).limit(pageSize),
      AuditLog.countDocuments(query),
    ])

    res.json({ logs, total, page, limit: pageSize, pages: Math.ceil(total / pageSize) })
  } catch (err) {
    serverError(res, 'list audit logs', err, 'Failed to fetch audit logs')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/admin/audit-logs
// Create a new audit log record
// ─────────────────────────────────────────────────────────
router.post('/audit-logs', async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {}
    const user = req.authUser
    const masterDb = await connectMasterDatabase()
    const AuditLog = getAuditLogModel(masterDb)

    // Signed-in callers are recorded as themselves and can only log against their own store.
    // Anonymous entries are kept but flagged, and can never claim an admin or merchant identity.
    const verified = Boolean(user)
    const tenantSlug = user?.role === 'super_admin' ? fieldOpt(b, 'tenantSlug', 60)?.toLowerCase() || '' : user?.tenantSlug || ''
    const severity = ['info', 'warning', 'security', 'critical'].includes(b.severity) ? b.severity : 'info'
    const category = ['auth', 'security', 'products', 'orders', 'branding', 'billing', 'provisioning', 'database', 'settings'].includes(b.category)
      ? b.category
      : 'settings'

    const newLog = new AuditLog({
      id: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      actorId: user?.userId || 'anonymous',
      actorName: verified ? user!.email : 'Unverified client',
      actorRole: user?.role || 'system',
      tenantSlug,
      tenantName: verified ? fieldOpt(b, 'tenantName', 100) || '' : '',
      action: fieldReq(b, 'action', 100),
      category,
      severity: verified ? severity : 'info',
      details: fieldReq(b, 'details', 2000),
      ipAddress: req.ip || '',
      userAgent: (req.get('User-Agent') || '').slice(0, 300),
      metadata: { verified },
    })

    await newLog.save()
    res.status(201).json({ success: true, id: newLog.id })
  } catch (err) {
    serverError(res, 'record audit log', err, 'Failed to record audit log')
  }
})

export default router
