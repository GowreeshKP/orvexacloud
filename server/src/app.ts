// --- Orvexa Tech Express Application ---
// Pure app configuration — no listen() call so it can be used
// both by the local dev server (index.ts) and the Vercel serverless handler (api/index.ts)

import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import masterRoutes from './routes/masterRoutes.js'
import storeRoutes from './routes/storeRoutes.js'
import authRoutes from './routes/authRoutes.js'
import publicRoutes from './routes/publicRoutes.js'
import { emailConfigured } from './services/mailer.js'
import { PLATFORM_ROOT_DOMAIN } from './config/plans.js'
import { hostLookupKeys } from './lib/hosts.js'

class CorsRejected extends Error {}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  // Behind Vercel / a load balancer the client IP is in X-Forwarded-For; rate limits key on it.
  // TRUST_PROXY = number of trusted hops (default 1 on Vercel, 0 elsewhere).
  const trustProxy = Number(process.env.TRUST_PROXY ?? (process.env.VERCEL ? 1 : 0))
  if (trustProxy > 0) app.set('trust proxy', trustProxy)

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  })

  // Allowed origins — extend via CORS_ORIGIN env var (comma-separated). Vercel preview
  // deployments are only trusted when CORS_ALLOW_VERCEL_PREVIEWS=true: any Vercel user can
  // create a *.vercel.app site.
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8443')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  const allowVercelPreviews = process.env.CORS_ALLOW_VERCEL_PREVIEWS === 'true'
  let customHostCache = { at: 0, values: new Set<string>() }
  async function originAllowed(origin: string): Promise<boolean> {
    if (
      allowedOrigins.includes(origin) ||
      (allowedOrigins.includes('*') && process.env.NODE_ENV !== 'production') ||
      (allowVercelPreviews && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin))
    ) {
      return true
    }
    let host = ''
    try {
      host = new URL(origin).hostname.toLowerCase()
    } catch {
      return false
    }
    if (host === PLATFORM_ROOT_DOMAIN || host === `www.${PLATFORM_ROOT_DOMAIN}` || host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
      return true
    }
    const now = Date.now()
    if (now - customHostCache.at > 60_000) {
      try {
        const { connectMasterDatabase } = await import('./config/db.js')
        const { getTenantModel } = await import('./models/master/Tenant.js')
        const db = await connectMasterDatabase()
        const rows = await getTenantModel(db).find({ customDomain: { $gt: '' } }).select('customDomain').lean()
        const values = new Set<string>()
        for (const row of rows) {
          for (const h of hostLookupKeys(String((row as { customDomain?: string }).customDomain || ''))) values.add(h)
        }
        customHostCache = { at: now, values }
      } catch {
        customHostCache = { at: now, values: customHostCache.values }
      }
    }
    const bare = host.startsWith('www.') ? host.slice(4) : host
    return customHostCache.values.has(host) || customHostCache.values.has(bare)
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true)
          return
        }
        originAllowed(origin).then((ok) => {
          if (ok) callback(null, true)
          else callback(new CorsRejected('Origin not allowed'))
        }).catch(() => callback(new CorsRejected('Origin not allowed')))
      },
      credentials: true,
      exposedHeaders: ['X-Total-Count'],
    })
  )

  // Automated test suites only; ignored in production.
  const skip = () => process.env.DISABLE_RATE_LIMITS === 'true' && process.env.NODE_ENV !== 'production'

  // Global rate limit — 300 requests / 15 min per IP
  const globalLimiter = rateLimit({
    skip,
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again later.' },
  })

  // Credential endpoints — tighter in production; looser locally so approve/login testing is not blocked.
  const authLimiter = rateLimit({
    skip,
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 10 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please wait 15 minutes before trying again.' },
  })
  const credentialPaths = /\/(login|forgot-password|reset-password|change-password|bootstrap)$/

  // Signup connector — 60 requests / minute per IP
  const publicLimiter = rateLimit({
    skip,
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please retry shortly.' },
  })

  app.use(globalLimiter)
  // Must precede express.json(): signup signatures are verified against the raw body bytes.
  app.use('/api/public', publicLimiter, publicRoutes)
  // Product images may be inline data URLs (≤ ~1.5 MB each); nothing legitimate needs more.
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: false, limit: '100kb' }))

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      platform: 'Orvexa Tech Multi-Tenant Engine',
      timestamp: new Date().toISOString(),
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node',
      signupIntake: process.env.SIGNUP_SIGNING_SECRETS ? 'on' : 'off',
      decisionEmail: emailConfigured() ? 'on' : 'off',
    })
  })

  // Route groups
  app.use('/api/auth', (req, res, next) => (credentialPaths.test(req.path) ? authLimiter(req, res, next) : next()), authRoutes)
  app.use('/api/admin', masterRoutes)
  app.use('/api/stores/:tenantSlug', storeRoutes)

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Fallback error handler — never echoes internal error messages to the client.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CorsRejected) {
      res.status(403).json({ error: 'Origin not allowed' })
      return
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' })
      return
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body is not valid JSON.' })
      return
    }
    console.error('[Server Error]:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}

// Singleton instance — re-used across warm serverless invocations
export const app = createApp()
export default app
