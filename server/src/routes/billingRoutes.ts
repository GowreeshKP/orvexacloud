import { Router, type Request, type Response } from 'express'
import { exportByToken, handleRazorpayEvent, verifyRazorpaySignature } from '../services/billing.js'

export async function razorpayWebhook(req: Request, res: Response): Promise<void> {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'Billing webhooks are not configured.' })
    return
  }
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''))
  if (!verifyRazorpaySignature(raw, req.get('x-razorpay-signature'))) {
    res.status(400).json({ error: 'Invalid signature.' })
    return
  }
  try {
    await handleRazorpayEvent(JSON.parse(raw.toString('utf8')))
    res.json({ ok: true })
  } catch (err) {
    console.error('[billing] webhook failed', (err as Error).message)
    res.status(500).json({ error: 'Webhook handling failed.' })
  }
}

const router = Router()

router.get('/export', async (req: Request, res: Response) => {
  try {
    const data = await exportByToken(String(req.query.token || ''))
    if (!data) {
      res.status(404).json({ error: 'This download link is invalid or has expired.' })
      return
    }
    res.setHeader('Content-Disposition', `attachment; filename="${data.slug}-export.json"`)
    res.json(data)
  } catch (err) {
    console.error('[billing] export failed', (err as Error).message)
    res.status(500).json({ error: 'Could not build the export.' })
  }
})

export default router
