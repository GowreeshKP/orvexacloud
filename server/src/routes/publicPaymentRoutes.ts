// Public Razorpay helpers for marketing-site plan checkout (applicant subscriptions).
import { Router, type Request, type Response } from 'express'
import { connectMasterDatabase } from '../config/db.js'
import { getApplicationModel } from '../models/master/Application.js'
import {
  createRazorpayOrder,
  getPlatformPaymentConfig,
  publicPaymentConfig,
  subscriptionAmountPaise,
  verifyRazorpaySignature,
} from '../services/platformPayments.js'
import { isPlainObject, optString, ValidationError } from '../lib/validate.js'

const router = Router()

function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message })
    return
  }
  console.error('[PublicPayments]', err)
  res.status(500).json({ error: fallback })
}

/** Unsigned — marketing form needs key id + UPI VPA before checkout. Never returns the secret. */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const cfg = await getPlatformPaymentConfig()
    res.json(publicPaymentConfig(cfg))
  } catch (err) {
    sendError(res, err, 'Payment config unavailable.')
  }
})

/**
 * Create a Razorpay order for the selected Orvexa plan (applicant / subscription).
 * Body: { planId, cycle?, applicationId?, receipt? }
 */
router.post('/subscription-order', async (req: Request, res: Response) => {
  try {
    if (!isPlainObject(req.body)) throw new ValidationError('Request body must be a JSON object.')
    const planId = optString(req.body.planId, 'planId', 40) || 'starter'
    const cycle = optString(req.body.cycle, 'cycle', 20) === 'yearly' ? 'yearly' : 'monthly'
    const applicationId = optString(req.body.applicationId, 'applicationId', 80)
    const priced = subscriptionAmountPaise(planId, cycle)

    if (priced.amountPaise <= 0) {
      res.json({
        free: true,
        plan: priced.plan,
        label: priced.label,
        cycle,
        amountExTax: 0,
        tax: 0,
        total: 0,
        message: 'Enterprise Plus is priced by contract — no online charge at signup.',
      })
      return
    }

    const receipt = (optString(req.body.receipt, 'receipt', 40) || `sub_${priced.plan}_${Date.now()}`).slice(0, 40)
    const order = await createRazorpayOrder({
      amountPaise: priced.amountPaise,
      receipt,
      notes: {
        plan: priced.plan,
        cycle,
        applicationId: applicationId || '',
        product: 'orvexa_subscription',
      },
    })
    const cfg = await getPlatformPaymentConfig()
    res.status(201).json({
      free: false,
      keyId: cfg.razorpayKeyId,
      upiVpa: cfg.upiVpa,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: priced.plan,
      label: priced.label,
      cycle,
      amountExTax: priced.amountExTax,
      tax: priced.tax,
      total: priced.total,
    })
  } catch (err) {
    sendError(res, err, 'Could not start plan payment.')
  }
})

/**
 * Verify Razorpay checkout signature and optionally stamp the application billing record.
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, applicationId? }
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    if (!isPlainObject(req.body)) throw new ValidationError('Request body must be a JSON object.')
    const orderId = optString(req.body.razorpay_order_id ?? req.body.orderId, 'razorpay_order_id', 80)
    const paymentId = optString(req.body.razorpay_payment_id ?? req.body.paymentId, 'razorpay_payment_id', 80)
    const signature = optString(req.body.razorpay_signature ?? req.body.signature, 'razorpay_signature', 200)
    if (!orderId || !paymentId || !signature) throw new ValidationError('Razorpay order id, payment id and signature are required.')

    const ok = await verifyRazorpaySignature({ orderId, paymentId, signature })
    if (!ok) {
      res.status(400).json({ error: 'Payment signature could not be verified.' })
      return
    }

    const applicationId = optString(req.body.applicationId, 'applicationId', 80)
    if (applicationId) {
      const db = await connectMasterDatabase()
      await getApplicationModel(db).updateOne(
        { id: applicationId },
        {
          $set: {
            billing: {
              provider: 'razorpay',
              orderId,
              paymentId,
              verifiedAt: new Date().toISOString(),
              status: 'paid',
            },
          },
        },
      )
    }

    res.json({ ok: true, orderId, paymentId })
  } catch (err) {
    sendError(res, err, 'Could not verify payment.')
  }
})

export default router
