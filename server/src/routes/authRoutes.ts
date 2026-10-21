// --- Authentication API Routes ---
// Multi-tenant auth: dual JWT (short-lived access + 30d refresh), token rotation,
// explicit logout, emailed password reset, and per-store staff login.

import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import type { Connection } from 'mongoose'
import { connectMasterDatabase } from '../config/db.js'
import { getTenantModel, tenantAllowsSignIn, type ITenant } from '../models/master/Tenant.js'
import { getAdminUserModel } from '../models/master/AdminUser.js'
import { getRefreshTokenModel } from '../models/master/RefreshToken.js'
import {
  accessTokenLifetimeSeconds,
  requireAdmin,
  requireSeller,
  signToken,
  signRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../middleware/authMiddleware.js'
import { sendEmail } from '../services/mailer.js'
import { issueOwnerPasswordLink, publicAppUrl } from '../services/ownerPasswordLink.js'
import { clearLoginFailures, loginLockStatus, recordLoginFailure } from '../services/loginLockout.js'

const router = Router()

const INVALID_LOGIN = 'Invalid login credentials. Please check your email or password.'
const RESET_PENDING =
  'Your password was reset by an administrator. Use the link emailed to the store owner to choose a new password.'
const MIN_PASSWORD = 8
const MAX_PASSWORD = 200
// bcrypt hash compared against when no account matches, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 12)

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** Reads a credential field: must be a non-empty string within bounds, otherwise null. */
function credential(v: unknown, max = 254): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > 0 && s.length <= max ? s : null
}

function validNewPassword(v: unknown): string | null {
  return typeof v === 'string' && v.length >= MIN_PASSWORD && v.length <= MAX_PASSWORD ? v : null
}

function isResetPending(tenant: ITenant): boolean {
  return Boolean(tenant.passwordResetPending) || Boolean(tenant.passwordHash?.startsWith('$2a$12$REVOKED_'))
}

function serverError(res: Response, context: string, err: unknown, message = 'Authentication service error. Please try again.') {
  console.error(`[Auth] ${context}:`, err)
  res.status(500).json({ error: message })
}

async function issueTokenPair(masterDb: Connection, payload: Omit<JwtPayload, 'tokenType' | 'iat'>) {
  const accessToken = signToken(payload)
  const refreshToken = signRefreshToken(payload)

  const RefreshToken = getRefreshTokenModel(masterDb)
  await new RefreshToken({
    tokenHash: hashToken(refreshToken),
    userId: payload.userId,
    role: payload.role,
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).save()

  return { accessToken, refreshToken, expiresIn: accessTokenLifetimeSeconds() }
}

/** Ends every session of a store owner (after a password change or reset). */
async function revokeOwnerSessions(masterDb: Connection, slug: string): Promise<void> {
  await getRefreshTokenModel(masterDb).deleteMany({ userId: `usr_${slug}` })
}

async function adminSession(masterDb: Connection, admin: { _id: unknown; id: string; email: string; name: string }) {
  await getAdminUserModel(masterDb).updateOne({ _id: admin._id }, { $set: { lastLogin: new Date().toISOString() } })
  const tokens = await issueTokenPair(masterDb, { userId: admin.id, email: admin.email, role: 'super_admin' })
  return {
    success: true,
    ...tokens,
    session: { userId: admin.id, name: admin.name, email: admin.email, role: 'super_admin', loginTime: new Date().toISOString() },
  }
}

async function sellerSession(masterDb: Connection, tenant: ITenant) {
  const userId = `usr_${tenant.slug}`
  const claims = { userId, email: tenant.ownerEmail, role: 'seller' as const, tenantId: tenant.id, tenantSlug: tenant.slug, brandName: tenant.brandName }
  const tokens = await issueTokenPair(masterDb, claims)
  return {
    success: true,
    ...tokens,
    session: { ...claims, name: tenant.ownerName || 'Merchant', loginTime: new Date().toISOString() },
  }
}

async function staffSession(masterDb: Connection, tenant: ITenant, staff: ITenant['staffMembers'][number]) {
  const claims = { userId: staff.id, email: staff.email, role: 'staff' as const, tenantId: tenant.id, tenantSlug: tenant.slug, brandName: tenant.brandName }
  const tokens = await issueTokenPair(masterDb, claims)
  return {
    success: true,
    ...tokens,
    session: { ...claims, name: staff.name, staffRole: staff.role, loginTime: new Date().toISOString() },
  }
}

/** Store-owner login result: a session, or an HTTP status + message. */
async function attemptSellerLogin(masterDb: Connection, loginId: string, password: string) {
  const tenant = await getTenantModel(masterDb).findOne({ $or: [{ ownerEmail: loginId }, { slug: loginId }] })
  const ok = await bcrypt.compare(password, tenant?.passwordHash && !isResetPending(tenant) ? tenant.passwordHash : DUMMY_HASH)
  if (!tenant) return null
  if (isResetPending(tenant)) return { status: 401, body: { error: RESET_PENDING, passwordResetPending: true } }
  if (!ok) return null
  if (tenant.status === 'suspended') return { status: 403, body: { error: 'Your store has been suspended. Please contact support.' } }
  if (tenant.status === 'pending') return { status: 403, body: { error: 'Your store application is still under review.' } }
  if (tenant.status === 'cancelled') return { status: 403, body: { error: 'This store has been closed. Please contact support.' } }
  return { status: 200, body: await sellerSession(masterDb, tenant) }
}

// ─────────────────────────────────────────────────────────
// POST /api/auth/login (Unified Common Login Endpoint)
// Auto-detects Super Admin, Merchant, or Store Staff
// ─────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const loginId = credential(req.body?.loginId)?.toLowerCase()
    const password = credential(req.body?.password, MAX_PASSWORD)
    if (!loginId || !password) {
      res.status(400).json({ error: 'Please enter your Email or Login ID and password.' })
      return
    }

    const masterDb = await connectMasterDatabase()

    const admin = await getAdminUserModel(masterDb).findOne({ $or: [{ email: loginId }, { id: loginId }] })
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      res.json(await adminSession(masterDb, admin))
      return
    }

    const seller = await attemptSellerLogin(masterDb, loginId, password)
    if (seller) {
      res.status(seller.status).json(seller.body)
      return
    }

    const tenantWithStaff = await getTenantModel(masterDb).findOne({ 'staffMembers.email': loginId })
    const staff = tenantWithStaff?.staffMembers.find((s) => s.email.toLowerCase() === loginId)
    if (staff && tenantWithStaff && (await bcrypt.compare(password, staff.passwordHash))) {
      if (!tenantAllowsSignIn(tenantWithStaff.status)) {
        res.status(403).json({ error: 'This store is not active.' })
        return
      }
      res.json(await staffSession(masterDb, tenantWithStaff, staff))
      return
    }

    res.status(401).json({ error: INVALID_LOGIN })
  } catch (err) {
    serverError(res, 'login', err)
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/seller/login — store owner login
// ─────────────────────────────────────────────────────────
router.post('/seller/login', async (req: Request, res: Response) => {
  try {
    const loginId = credential(req.body?.loginId)?.toLowerCase()
    const password = credential(req.body?.password, MAX_PASSWORD)
    if (!loginId || !password) {
      res.status(400).json({ error: 'Please enter your Login ID and password.' })
      return
    }
    const masterDb = await connectMasterDatabase()
    const result = await attemptSellerLogin(masterDb, loginId, password)
    if (!result) {
      res.status(401).json({ error: INVALID_LOGIN })
      return
    }
    res.status(result.status).json(result.body)
  } catch (err) {
    serverError(res, 'seller login', err)
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/admin/login — platform super admin login
// ─────────────────────────────────────────────────────────
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const loginId = credential(req.body?.loginId)?.toLowerCase()
    const password = credential(req.body?.password, MAX_PASSWORD)
    if (!loginId || !password) {
      res.status(400).json({ error: 'Please enter Admin ID and master password.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const lockKey = `admin:${loginId}`
    const locked = await loginLockStatus(masterDb, lockKey)
    if (locked.locked) {
      res.status(429).json({
        error: `Too many failed attempts. Try again in ${locked.retryAfterSeconds}s.`,
        locked: true,
        retryAfterSeconds: locked.retryAfterSeconds,
      })
      return
    }
    const admin = await getAdminUserModel(masterDb).findOne({ $or: [{ email: loginId }, { id: loginId }] })
    const ok = await bcrypt.compare(password, admin?.passwordHash || DUMMY_HASH)
    if (!admin || !ok) {
      const failure = await recordLoginFailure(masterDb, lockKey)
      res.status(failure.locked ? 429 : 401).json({
        error: failure.locked
          ? 'Too many failed attempts. Sign-in is locked for 60 seconds.'
          : 'Invalid Super Admin credentials.',
        locked: failure.locked,
        retryAfterSeconds: failure.retryAfterSeconds,
        remaining: failure.remaining,
      })
      return
    }
    await clearLoginFailures(masterDb, lockKey)
    res.json(await adminSession(masterDb, admin))
  } catch (err) {
    serverError(res, 'admin login', err)
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/staff/login — per-store staff login. Body: { tenantSlug, email, password }
// ─────────────────────────────────────────────────────────
router.post('/staff/login', async (req: Request, res: Response) => {
  try {
    const tenantSlug = credential(req.body?.tenantSlug, 60)?.toLowerCase()
    const email = credential(req.body?.email)?.toLowerCase()
    const password = credential(req.body?.password, MAX_PASSWORD)
    if (!tenantSlug || !email || !password) {
      res.status(400).json({ error: 'tenantSlug, email, and password are required.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const tenant = await getTenantModel(masterDb).findOne({ slug: tenantSlug })
    const staff = tenant?.staffMembers.find((s) => s.email.toLowerCase() === email)
    const ok = await bcrypt.compare(password, staff?.passwordHash || DUMMY_HASH)
    if (!tenant || !staff || !ok) {
      res.status(401).json({ error: 'Invalid store or staff credentials.' })
      return
    }
    if (!tenantAllowsSignIn(tenant.status)) {
      res.status(403).json({ error: 'This store is not active.' })
      return
    }
    res.json(await staffSession(masterDb, tenant, staff))
  } catch (err) {
    serverError(res, 'staff login', err)
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/refresh — rotate refresh token (single use). Body: { refreshToken }
// Re-checks the account so suspended stores, removed staff and reset passwords lose access.
// ─────────────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = credential(req.body?.refreshToken, 4000)
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken is required.' })
      return
    }

    let decoded: JwtPayload
    try {
      decoded = verifyRefreshToken(refreshToken)
    } catch {
      res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const RefreshToken = getRefreshTokenModel(masterDb)
    // Atomic delete: a token replayed concurrently is only accepted once.
    const stored = await RefreshToken.findOneAndDelete({ tokenHash: hashToken(refreshToken) })
    if (!stored) {
      res.status(401).json({ error: 'Refresh token has been revoked. Please log in again.' })
      return
    }

    const revoked = () => res.status(401).json({ error: 'Your session is no longer valid. Please log in again.' })
    if (decoded.role === 'super_admin') {
      const admin = await getAdminUserModel(masterDb).findOne({ id: decoded.userId })
      if (!admin) return void revoked()
      res.json(await adminSession(masterDb, admin))
      return
    }

    const tenant = await getTenantModel(masterDb).findOne({ slug: decoded.tenantSlug, id: decoded.tenantId })
    if (!tenant || !tenantAllowsSignIn(tenant.status)) return void revoked()
    if (decoded.role === 'seller') {
      if (isResetPending(tenant)) return void revoked()
      res.json(await sellerSession(masterDb, tenant))
      return
    }
    const staff = tenant.staffMembers.find((s) => s.id === decoded.userId)
    if (!staff) return void revoked()
    res.json(await staffSession(masterDb, tenant, staff))
  } catch (err) {
    serverError(res, 'refresh', err, 'Token refresh failed')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/logout — revoke a refresh token. Body: { refreshToken }
// ─────────────────────────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = credential(req.body?.refreshToken, 4000)
    if (refreshToken) {
      const masterDb = await connectMasterDatabase()
      await getRefreshTokenModel(masterDb).deleteOne({ tokenHash: hashToken(refreshToken) })
    }
    res.json({ success: true, message: 'Logged out successfully.' })
  } catch (err) {
    serverError(res, 'logout', err, 'Logout failed')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/seller/forgot-password. Body: { email }
// Emails a single-use 30-minute reset link to the owner address on file. The response is
// identical whether or not the account exists, and never contains the token.
// ─────────────────────────────────────────────────────────
router.post('/seller/forgot-password', async (req: Request, res: Response) => {
  const generic = { success: true, message: 'If an account with that email exists, a reset link has been sent.' }
  try {
    const email = credential(req.body?.email)?.toLowerCase()
    if (!email) {
      res.status(400).json({ error: 'email is required.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const tenant = await getTenantModel(masterDb).findOne({ ownerEmail: email })
    res.json(generic)
    if (!tenant || !tenantAllowsSignIn(tenant.status)) return

    // Never derive the link from request headers: an attacker-controlled Origin would put the
    // victim's reset token on the attacker's site.
    const link = await issueOwnerPasswordLink(masterDb, tenant.slug, publicAppUrl(), 30 * 60 * 1000)
    await sendEmail({
      to: tenant.ownerEmail,
      subject: `Reset your ${tenant.brandName} store password`,
      text: [
        `Hi ${tenant.ownerName || 'there'},`,
        '',
        'Someone asked to reset the password for your Orvexa Cloud store. Use this link within 30 minutes:',
        link.url,
        '',
        'If you did not ask for this, ignore this email; your password stays the same.',
      ].join('\n'),
    })
  } catch (err) {
    if (!res.headersSent) serverError(res, 'forgot password', err, 'Failed to initiate password reset')
    else console.error('[Auth] forgot password:', err)
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/seller/reset-password. Body: { tenantSlug, resetToken, newPassword }
// ─────────────────────────────────────────────────────────
router.post('/seller/reset-password', async (req: Request, res: Response) => {
  try {
    const tenantSlug = credential(req.body?.tenantSlug, 60)?.toLowerCase()
    const resetToken = credential(req.body?.resetToken, 200)
    const newPassword = validNewPassword(req.body?.newPassword)
    if (!tenantSlug || !resetToken || req.body?.newPassword === undefined) {
      res.status(400).json({ error: 'tenantSlug, resetToken, and newPassword are required.' })
      return
    }
    if (!newPassword) {
      res.status(400).json({ error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters.` })
      return
    }

    const masterDb = await connectMasterDatabase()
    const RefreshToken = getRefreshTokenModel(masterDb)
    // Consume the token atomically (single use).
    const stored = await RefreshToken.findOneAndDelete({ tokenHash: hashToken(resetToken), userId: `reset_${tenantSlug}` })
    if (!stored || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid or expired reset link. Please request a new one.' })
      return
    }

    await getTenantModel(masterDb).updateOne(
      { slug: tenantSlug },
      {
        $set: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          passwordResetPending: false,
          passwordResetRequestedAt: '',
          passwordChangedAt: new Date(),
        },
      }
    )
    await RefreshToken.deleteMany({ userId: `reset_${tenantSlug}` })
    await revokeOwnerSessions(masterDb, tenantSlug)

    res.json({ success: true, message: 'Password updated successfully. Please log in with your new password.' })
  } catch (err) {
    serverError(res, 'reset password', err, 'Failed to reset password')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/seller/set-password — super admin sets a store owner's password.
// Body: { slug, newPassword }. Previously guarded by a shared ADMIN_SETUP_KEY, which anyone
// holding the key could use to take over any store.
// ─────────────────────────────────────────────────────────
router.post('/seller/set-password', requireAdmin, async (req: Request, res: Response) => {
  try {
    const slug = credential(req.body?.slug, 60)?.toLowerCase()
    const newPassword = validNewPassword(req.body?.newPassword)
    if (!slug || !newPassword) {
      res.status(400).json({ error: `slug and newPassword (${MIN_PASSWORD}-${MAX_PASSWORD} chars) are required.` })
      return
    }

    const masterDb = await connectMasterDatabase()
    const tenant = await getTenantModel(masterDb).findOneAndUpdate(
      { slug },
      { $set: { passwordHash: await bcrypt.hash(newPassword, 12), passwordResetPending: false, passwordChangedAt: new Date() } }
    )
    if (!tenant) {
      res.status(404).json({ error: 'Store not found.' })
      return
    }
    await revokeOwnerSessions(masterDb, slug)
    res.json({ success: true, message: `Password set for store "${tenant.brandName}".` })
  } catch (err) {
    serverError(res, 'set password', err, 'Failed to set password')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/seller/change-password — store owner changes their password.
// Body: { slug, currentPassword, newPassword }. The current password is always required.
// ─────────────────────────────────────────────────────────
// PUT /api/auth/seller/profile — store owner updates name / email / phone (not password).
router.put('/seller/profile', requireSeller, async (req: Request, res: Response) => {
  try {
    const slug = credential(req.body?.slug, 60)?.toLowerCase()
    const ownerName = credential(req.body?.ownerName, 100)
    const ownerEmail = credential(req.body?.ownerEmail)?.toLowerCase()
    const ownerPhone = credential(req.body?.ownerPhone, 20)
    if (!slug) {
      res.status(400).json({ error: 'slug is required.' })
      return
    }
    const user = req.authUser
    if (user?.role === 'seller' && user.tenantSlug !== slug) {
      res.status(403).json({ error: 'You can only update your own store profile.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const tenant = await Tenant.findOne({ slug })
    if (!tenant) {
      res.status(404).json({ error: 'Store not found.' })
      return
    }

    const updates: Record<string, unknown> = {}
    if (ownerName) updates.ownerName = ownerName
    if (ownerPhone !== undefined) updates.ownerPhone = ownerPhone || ''
    if (ownerEmail) {
      if (!ownerEmail.includes('@') || ownerEmail.length > 254) {
        res.status(400).json({ error: 'ownerEmail is not a valid email address.' })
        return
      }
      if (ownerEmail !== tenant.ownerEmail && (await Tenant.exists({ $or: [{ ownerEmail }, { 'staffMembers.email': ownerEmail }] }))) {
        res.status(409).json({ error: 'This email is already used by another account.' })
        return
      }
      updates.ownerEmail = ownerEmail
    }
    const updated = await Tenant.findOneAndUpdate({ slug }, { $set: updates }, { new: true })
    res.json({
      success: true,
      tenant: {
        slug: updated?.slug,
        ownerName: updated?.ownerName,
        ownerEmail: updated?.ownerEmail,
        ownerPhone: updated?.ownerPhone,
      },
    })
  } catch (err) {
    serverError(res, 'seller profile', err, 'Failed to update profile')
  }
})

router.post('/seller/change-password', async (req: Request, res: Response) => {
  try {
    const slug = credential(req.body?.slug, 60)?.toLowerCase()
    const currentPassword = credential(req.body?.currentPassword, MAX_PASSWORD)
    const newPassword = validNewPassword(req.body?.newPassword)
    if (!slug || !newPassword) {
      res.status(400).json({ error: `Store identifier and newPassword (${MIN_PASSWORD}-${MAX_PASSWORD} chars) are required.` })
      return
    }

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    const tenant = await Tenant.findOne({ slug })
    const hash = tenant?.passwordHash && !isResetPending(tenant) ? tenant.passwordHash : DUMMY_HASH
    const ok = Boolean(currentPassword) && (await bcrypt.compare(currentPassword!, hash))
    if (!tenant || !ok || hash === DUMMY_HASH) {
      res.status(401).json({ error: 'Current password does not match.' })
      return
    }

    await Tenant.updateOne({ slug }, { $set: { passwordHash: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() } })
    await revokeOwnerSessions(masterDb, slug)
    res.json({ success: true, message: `Password successfully updated for ${tenant.brandName}. Please sign in again.` })
  } catch (err) {
    serverError(res, 'change password', err, 'Failed to update password')
  }
})

// ─────────────────────────────────────────────────────────
// POST /api/auth/admin/bootstrap — create the first super admin. Disabled once one exists.
// Body: { name, email, password, bootstrapKey }
// ─────────────────────────────────────────────────────────
const PUBLISHED_BOOTSTRAP_KEYS = new Set(['orvexa_bootstrap_2026'])

function bootstrapKeyMatches(provided: string | null): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_KEY
  const usable = Boolean(expected && expected.length >= 16 && !PUBLISHED_BOOTSTRAP_KEYS.has(expected))
  return Boolean(
    usable &&
      provided &&
      expected &&
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)),
  )
}

router.post('/admin/bootstrap', async (req: Request, res: Response) => {
  try {
    const provided = credential(req.body?.bootstrapKey, 500)
    if (!bootstrapKeyMatches(provided)) {
      res.status(403).json({ error: 'Invalid bootstrap key.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const AdminUser = getAdminUserModel(masterDb)
    if ((await AdminUser.countDocuments()) > 0) {
      res.status(409).json({ error: 'Admin already bootstrapped. Use the admin panel to manage accounts.' })
      return
    }

    const email = credential(req.body?.email)?.toLowerCase()
    const password = validNewPassword(req.body?.password)
    if (!email || !password || password.length < 12) {
      res.status(400).json({ error: 'email and a password of at least 12 characters are required.' })
      return
    }

    await new AdminUser({
      id: `admin_${crypto.randomBytes(6).toString('hex')}`,
      name: credential(req.body?.name, 100) || 'Super Admin',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'super_admin',
    }).save()

    console.warn('[bootstrap] Super admin created. Remove ADMIN_BOOTSTRAP_KEY from the host secrets now and never reuse it.')
    res.status(201).json({
      success: true,
      message: 'Super admin account created. Delete ADMIN_BOOTSTRAP_KEY from Render immediately — this endpoint is now inert.',
    })
  } catch (err) {
    serverError(res, 'bootstrap', err, 'Bootstrap failed')
  }
})

// POST /api/auth/admin/recover — reset the existing super admin password with the same
// bootstrap key. Use this when bootstrap already ran and the password was lost.
// Body: { bootstrapKey, password, email? }
router.post('/admin/recover', async (req: Request, res: Response) => {
  try {
    const provided = credential(req.body?.bootstrapKey, 500)
    if (!bootstrapKeyMatches(provided)) {
      res.status(403).json({ error: 'Invalid bootstrap key.' })
      return
    }

    const password = validNewPassword(req.body?.password)
    if (!password || password.length < 12) {
      res.status(400).json({ error: 'A password of at least 12 characters is required.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const AdminUser = getAdminUserModel(masterDb)
    const email = credential(req.body?.email)?.toLowerCase()
    const admin = email
      ? await AdminUser.findOne({ email })
      : await AdminUser.findOne({}).sort({ createdAt: 1 })
    if (!admin) {
      res.status(404).json({ error: 'No super admin exists. Use /api/auth/admin/bootstrap first.' })
      return
    }

    admin.passwordHash = await bcrypt.hash(password, 12)
    await admin.save()
    await getRefreshTokenModel(masterDb).deleteMany({ userId: admin.id })
    console.warn('[bootstrap] Super admin password recovered. Delete ADMIN_BOOTSTRAP_KEY from the host now.')
    res.json({
      success: true,
      email: admin.email,
      message: 'Admin password reset. Delete ADMIN_BOOTSTRAP_KEY from Render immediately.',
    })
  } catch (err) {
    serverError(res, 'admin recover', err, 'Admin recovery failed')
  }
})

export default router
