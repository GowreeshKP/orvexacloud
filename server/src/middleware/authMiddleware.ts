// --- JWT Authentication & Authorization Middleware ---
// Provides token verification and role/tenant-scoped access control.
// Access tokens are short-lived (ACCESS_TOKEN_TTL, default 1h); refresh tokens are long-lived (30 days)
// and stored server-side in the RefreshToken collection for revocation support.

import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// A long placeholder such as "replace_with_a_long_random_secret..." passes a length check, so in production the value
// must also LOOK random. Accepted: hex from `openssl rand -hex 32`, or base64 text of 43+ characters with at least three
// character types and the high character entropy of real random bytes (measured: random base64 never falls below ~4.4 bits,
// human phrases sit at 3.4 to 4.2). This cannot prove a secret is random; the guide tells people to use openssl.
const PLACEHOLDER_WORDS = /(replace|change[-_ ]?me|your[-_ ]|example|placeholder|secret[-_ ]?here|default|dev-only|not[-_ ]for[-_ ]production|orvexa_jwt|jwt_secret|random_secret|at_least|long_random|todo|password)/i
function charEntropy(v: string): number {
  const f = new Map<string, number>()
  for (const c of v) f.set(c, (f.get(c) ?? 0) + 1)
  let h = 0
  for (const n of f.values()) h -= (n / v.length) * Math.log2(n / v.length)
  return h
}
function looksRandom(v: string): boolean {
  if (/^[0-9a-f]{48,}$/i.test(v)) return true
  if (PLACEHOLDER_WORDS.test(v)) return false
  const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length
  return /^[A-Za-z0-9+/_=-]{43,}$/.test(v) && types >= 3 && charEntropy(v) >= 4.3
}

function loadSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const value = process.env[name]
  if (IS_PRODUCTION) {
    if (!value || value.length < 32) {
      throw new Error(`${name} must be set to a random value of at least 32 characters in production.`)
    }
    if (!looksRandom(value)) {
      throw new Error(`${name} looks like a placeholder or a guessable phrase. Generate a real one with: openssl rand -hex 32`)
    }
    return value
  }
  if (value && value.length >= 32) return value
  if (value) console.warn(`[auth] ${name} is shorter than 32 characters; use a longer random value.`)
  return value || devFallback
}

const JWT_SECRET = loadSecret('JWT_SECRET', 'dev-only-access-secret-not-for-production-use')
const JWT_REFRESH_SECRET = loadSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-not-for-production-use')
if (JWT_SECRET === JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different values.')
}

export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '1h'
const ACCESS_TOKEN_TTL_SECONDS = ttlToSeconds(ACCESS_TOKEN_TTL)

function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim())
  if (!m) return 3600
  const n = Number(m[1])
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as const)[(m[2] || 's') as 's' | 'm' | 'h' | 'd']
}

export function accessTokenLifetimeSeconds(): number {
  return ACCESS_TOKEN_TTL_SECONDS
}

export interface JwtPayload {
  userId: string
  email: string
  role: 'seller' | 'super_admin' | 'staff'
  tenantId?: string
  tenantSlug?: string
  brandName?: string
  /** Distinguishes access tokens from refresh tokens to prevent misuse */
  tokenType?: 'access' | 'refresh'
  iat?: number
}

// Extend Express Request with decoded token payload
declare global {
  namespace Express {
    interface Request {
      authUser?: JwtPayload
    }
  }
}

function decodeAccessToken(header: string | undefined): { user?: JwtPayload; error?: string } {
  if (!header || !header.startsWith('Bearer ')) {
    return { error: 'Missing or malformed Authorization header. Expected: Bearer <token>' }
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload
    if (decoded.tokenType !== 'access') {
      return { error: 'Invalid token type. Use your access token for API requests.' }
    }
    return { user: decoded }
  } catch (err: any) {
    return { error: err.name === 'TokenExpiredError' ? 'Session expired. Please refresh your session.' : 'Invalid token. Please log in again.' }
  }
}

// ─────────────────────────────────────────────────────────
// Core: parse and verify a Bearer token from Authorization header
// ─────────────────────────────────────────────────────────
export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const { user, error } = decodeAccessToken(req.headers.authorization)
  if (!user) {
    res.status(401).json({ error })
    return
  }
  req.authUser = user
  next()
}

/** Attaches req.authUser when a valid token is present; never rejects the request. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const { user } = decodeAccessToken(req.headers.authorization)
  if (user) req.authUser = user
  next()
}

function requireRoles(roles: JwtPayload['role'][], message: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    verifyToken(req, res, () => {
      if (!req.authUser || !roles.includes(req.authUser.role)) {
        res.status(403).json({ error: message })
        return
      }
      next()
    })
  }
}

/** Super admin only (platform admin panel routes). */
export const requireAdmin = requireRoles(['super_admin'], 'Access denied. Super Admin privileges required.')

/** Store owner (or super admin) — catalog, theme, staff and database management. */
export const requireSeller = requireRoles(['seller', 'super_admin'], 'Access denied. Merchant credentials required.')

/** Store staff or above — order fulfilment and read-only store operations. */
export const requireStaff = requireRoles(['staff', 'seller', 'super_admin'], 'Access denied. Store staff credentials required.')

// ─────────────────────────────────────────────────────────
// Require that the authenticated user belongs to the resolved tenant.
// Compares against req.tenant (looked up server-side by tenantResolver), never against
// client-supplied ids. Super admins bypass this check (platform-level access).
// Must be used AFTER requireSeller/requireStaff and AFTER tenantResolver.
// ─────────────────────────────────────────────────────────
export function requireTenantAccess(req: Request, res: Response, next: NextFunction): void {
  const user = req.authUser
  const tenant = req.tenant

  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  if (user.role === 'super_admin') {
    next()
    return
  }
  if (!tenant) {
    res.status(400).json({ error: 'Tenant could not be resolved for this request.' })
    return
  }
  if (user.tenantSlug !== tenant.slug || (user.tenantId && tenant.id && user.tenantId !== tenant.id)) {
    res.status(403).json({ error: 'Access denied. You are not authorized to manage this store.' })
    return
  }
  // Tokens outlive account changes; re-check the account against the current tenant record.
  if (user.role === 'staff' && !tenant.staffMembers?.some((s) => s.id === user.userId)) {
    res.status(401).json({ error: 'This staff account no longer exists. Please contact the store owner.' })
    return
  }
  if (user.role === 'seller') {
    const changedAt = tenant.passwordChangedAt ? Math.floor(new Date(tenant.passwordChangedAt).getTime() / 1000) : 0
    if (tenant.passwordResetPending || (user.iat !== undefined && changedAt > user.iat)) {
      res.status(401).json({ error: 'Your password was changed. Please sign in again.' })
      return
    }
  }
  next()
}

// ─────────────────────────────────────────────────────────
// Utilities: issue short-lived access token and
//            long-lived refresh token (30d, signed with separate secret)
// ─────────────────────────────────────────────────────────

export function signToken(payload: JwtPayload, expiresIn: string = ACCESS_TOKEN_TTL): string {
  const { tokenType: _t, iat: _i, ...claims } = payload
  return jwt.sign({ ...claims, tokenType: 'access' }, JWT_SECRET, { expiresIn, algorithm: 'HS256' } as jwt.SignOptions)
}

/** Issue a long-lived refresh token (default 30 days) signed with a separate secret */
export function signRefreshToken(payload: Omit<JwtPayload, 'tokenType'>, expiresIn: string = '30d'): string {
  const { iat: _i, ...claims } = payload
  // jti keeps two refresh tokens issued in the same second distinct (they are stored by hash).
  return jwt.sign({ ...claims, tokenType: 'refresh', jti: randomUUID() }, JWT_REFRESH_SECRET, {
    expiresIn,
    algorithm: 'HS256',
  } as jwt.SignOptions)
}

/** Verify and decode a refresh token */
export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as JwtPayload
  if (decoded.tokenType !== 'refresh') {
    throw new Error('Invalid token type')
  }
  return decoded
}

