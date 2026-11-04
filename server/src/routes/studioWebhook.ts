// Storefront Studio publish webhook — verifies HMAC and records the published theme version.
import { Router, type Request, type Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { connectMasterDatabase } from '../config/db.js'
import { getTenantModel } from '../models/master/Tenant.js'

const router = Router()

function configuredSecret(): string {
  return String(process.env.STUDIO_WEBHOOK_SECRET || process.env.PUBLISH_WEBHOOK_SECRET || '').trim()
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const secret = configuredSecret()
    if (!secret) {
      res.status(503).json({ error: 'Studio webhook is not configured.' })
      return
    }

    const ts = String(req.get('X-Orvexa-Timestamp') || '')
    const given = String(req.get('X-Orvexa-Signature') || '')
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}))
    const expected = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${raw.toString('utf8')}`).digest('hex')
    const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300
    const okSig =
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected))

    if (!fresh || !okSig) {
      res.status(401).json({ error: 'Invalid webhook signature.' })
      return
    }

    const event = JSON.parse(raw.toString('utf8')) as {
      event?: string
      storeId?: string
      version?: number
      themeUrl?: string
    }

    if (event.event !== 'storefront.published' || !event.storeId) {
      res.status(204).end()
      return
    }

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    await Tenant.updateOne(
      { slug: String(event.storeId).toLowerCase() },
      {
        $set: {
          storefrontStudioEnabled: true,
          storefrontThemeVersion: Number(event.version) || 1,
          storefrontPublishedAt: new Date().toISOString(),
          storefrontThemeUrl: typeof event.themeUrl === 'string' ? event.themeUrl : '',
        },
      }
    )

    res.status(204).end()
  } catch (err: any) {
    console.error('[Studio webhook]', err?.message || err)
    res.status(500).json({ error: 'Webhook processing failed.' })
  }
})

export default router
