import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { tenantResolver } from '../middleware/tenantResolver.js'
import { requireSeller, requireStaff, requireTenantAccess } from '../middleware/authMiddleware.js'
import { closeTenantConnection, getTenantConnection, connectMasterDatabase } from '../config/db.js'
import { getTenantModel } from '../models/master/Tenant.js'
import { getRefreshTokenModel } from '../models/master/RefreshToken.js'
import type { IOrderItem } from '../models/tenant/Order.js'
import { PLAN_CATALOG, PLATFORM_ROOT_DOMAIN, normalizePlanId, planAllows } from '../config/plans.js'
import { buildStoreExport, createSubscriptionCheckout } from '../services/billing.js'
import { STORE_EVENT_TYPES } from '../models/tenant/StoreEvent.js'
import { domainPointsAtPlatform, hostLookupKeys, isValidPublicHostname, normalizeHostname, platformCnameTarget } from '../lib/hosts.js'
import {
  ValidationError,
  EMAIL_PATTERN,
  escapeRegex,
  isPlainObject,
  normalizePhone,
  optBoolean,
  optImageUrl,
  optNumber,
  optString,
  optStringArray,
  pagination,
  queryString,
  reqNumber,
  reqString,
} from '../lib/validate.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { SUBSCRIBER_SOURCES, type SubscriberSource } from '../models/tenant/Inbox.js'
import { sendEmail } from '../services/mailer.js'

const router = Router({ mergeParams: true })

// Apply dynamic tenant database resolver to all routes
router.use(tenantResolver)

/** Store staff (or owner) of the resolved tenant. */
const staffOfTenant = [requireStaff, requireTenantAccess]
/** Store owner of the resolved tenant (or super admin). */
const ownerOfTenant = [requireSeller, requireTenantAccess]

const checkoutLimiter = rateLimit({
  skip: () => process.env.DISABLE_RATE_LIMITS === 'true' && process.env.NODE_ENV !== 'production',
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
})

function sendError(res: Response, err: unknown, fallback: string, context: string): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message })
    return
  }
  if ((err as any)?.name === 'ValidationError' || (err as any)?.name === 'CastError') {
    res.status(400).json({ error: 'Some of the submitted values are invalid.' })
    return
  }
  console.error(`[Store API] ${context}:`, err)
  res.status(500).json({ error: fallback })
}

async function collectSubscriber(req: Request, email: string, source: SubscriberSource): Promise<{ created: boolean }> {
  const normalized = email.trim().toLowerCase()
  try {
    await req.tenantDb!.Subscriber.create({ email: normalized, source, subscribedAt: new Date() })
    return { created: true }
  } catch (err: any) {
    if (err?.code === 11000) return { created: false }
    throw err
  }
}

// ====================================================================
// 1. PRODUCTS (Stored in tenant's isolated MongoDB)
// ====================================================================

const PRODUCT_SORTS: Record<string, Record<string, 1 | -1>> = {
  default: { id: 1 },
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  name: { name: 1 },
}

// GET products — public catalog. Supports ?category, ?search, ?inStock=true, ?sort, ?limit, ?page.
router.get('/products', async (req: Request, res: Response) => {
  try {
    const category = queryString(req.query.category)
    const search = queryString(req.query.search)?.trim()
    const filter: Record<string, unknown> = {}

    if (category && category !== 'all') filter.category = category
    if (req.query.inStock === 'true') filter.stockCount = { $gt: 0 }
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: 'i' }
      filter.$or = [{ name: pattern }, { category: pattern }, { fabricTech: pattern }]
    }

    const { limit, skip } = pagination(req.query, 200, 500)
    const sort = PRODUCT_SORTS[queryString(req.query.sort) || 'default'] || PRODUCT_SORTS.default
    const [products, total] = await Promise.all([
      req.tenantDb!.Product.find(filter).sort(sort).skip(skip).limit(limit),
      req.tenantDb!.Product.countDocuments(filter),
    ])
    res.setHeader('X-Total-Count', String(total))
    res.json(products)
  } catch (err) {
    sendError(res, err, 'Failed to fetch products', 'list products')
  }
})

function parseProductId(raw: unknown): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) throw new ValidationError('Invalid product id.')
  return id
}

// GET single product
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const product = await req.tenantDb!.Product.findOne({ id: parseProductId(req.params.id) })
    if (!product) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    res.json(product)
  } catch (err) {
    sendError(res, err, 'Failed to fetch product', 'get product')
  }
})

/** Whitelists and validates merchant-editable product fields. `partial` allows updates of a subset. */
function productFields(body: unknown, partial: boolean): Record<string, unknown> {
  if (!isPlainObject(body)) throw new ValidationError('Request body must be a JSON object.')
  const out: Record<string, unknown> = {}
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value
  }

  set('name', partial ? optString(body.name, 'name', 200) : reqString(body.name, 'name', 200))
  set('category', partial ? optString(body.category, 'category', 100) : reqString(body.category, 'category', 100))
  const price = partial
    ? optNumber(body.price, 'price', { min: 0.01, max: 10_000_000 })
    : reqNumber(body.price, 'price', { min: 0.01, max: 10_000_000 })
  set('price', price)
  set('mrp', optNumber(body.mrp, 'mrp', { min: 0, max: 10_000_000 }))
  set('stockCount', optNumber(body.stockCount, 'stockCount', { min: 0, max: 1_000_000, integer: true }))
  set('imgMain', partial ? optImageUrl(body.imgMain, 'imgMain') : optImageUrl(body.imgMain, 'imgMain') ?? '')
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length > 12) throw new ValidationError('images must be a list of at most 12 images.')
    set('images', body.images.map((img, i) => optImageUrl(img, `images[${i}]`) || '').filter(Boolean))
  }
  for (const key of ['sculptLevel', 'fabricTech', 'compression', 'badge'] as const) set(key, optString(body[key], key, 100))
  set('fabricDesc', optString(body.fabricDesc, 'fabricDesc', 2000))
  set('desc', optString(body.desc, 'desc', 5000))
  set('fitInfo', optString(body.fitInfo, 'fitInfo', 2000))
  set('details', optStringArray(body.details, 'details', 30, 500))
  set('sizes', optStringArray(body.sizes, 'sizes', 30, 30))
  set('isFeatured', optBoolean(body.isFeatured, 'isFeatured'))
  if (body.colors !== undefined) {
    if (!Array.isArray(body.colors) || body.colors.length > 30) throw new ValidationError('colors must be a list of at most 30 colours.')
    set(
      'colors',
      body.colors.map((c, i) => {
        if (!isPlainObject(c)) throw new ValidationError(`colors[${i}] must have a name and hex value.`)
        const hex = reqString(c.hex, `colors[${i}].hex`, 9)
        if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) throw new ValidationError(`colors[${i}].hex must be a hex colour like #AABBCC.`)
        return { name: reqString(c.name, `colors[${i}].name`, 50), hex }
      })
    )
  }
  if (price !== undefined) out.priceFormatted = `₹${price.toLocaleString('en-IN')}`
  if (partial && Object.keys(out).length === 0) throw new ValidationError('No editable product fields were provided.')
  return out
}

// POST create new product — store owner only
router.post('/products', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const Product = req.tenantDb!.Product
    const fields = productFields(req.body, false)
    const plan = PLAN_CATALOG[normalizePlanId(req.tenant!.plan)]
    if (plan.maxProducts !== null && (await Product.countDocuments()) >= plan.maxProducts) {
      res.status(403).json({
        error: `The ${plan.label} plan includes up to ${plan.maxProducts} products. Upgrade to Growth Pro for unlimited products.`,
        upgradeRequired: true,
      })
      return
    }
    // Ids are per-store sequence numbers; retry if two creates race for the same id.
    for (let attempt = 0; attempt < 5; attempt++) {
      const highest = await Product.findOne().sort({ id: -1 }).select('id')
      try {
        const saved = await new Product({ ...fields, id: (highest?.id || 0) + 1 }).save()
        res.status(201).json(saved)
        return
      } catch (err: any) {
        if (err?.code !== 11000) throw err
      }
    }
    res.status(503).json({ error: 'Could not allocate a product id. Please retry.' })
  } catch (err) {
    sendError(res, err, 'Failed to create product', 'create product')
  }
})

// PUT update product — store owner only
router.put('/products/:id', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const updated = await req.tenantDb!.Product.findOneAndUpdate(
      { id: parseProductId(req.params.id) },
      { $set: productFields(req.body, true) },
      { new: true, runValidators: true }
    )
    if (!updated) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    res.json(updated)
  } catch (err) {
    sendError(res, err, 'Failed to update product', 'update product')
  }
})

// DELETE product — store owner only. Existing orders keep their own snapshot of the item.
router.delete('/products/:id', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const deleted = await req.tenantDb!.Product.findOneAndDelete({ id: parseProductId(req.params.id) })
    if (!deleted) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    res.json({ success: true, message: 'Product deleted from store database' })
  } catch (err) {
    sendError(res, err, 'Failed to delete product', 'delete product')
  }
})

// ====================================================================
// 2. STOREFRONT THEME & HOMEPAGE PICTURE CUSTOMIZER
// ====================================================================

router.get('/theme', async (req: Request, res: Response) => {
  try {
    const themeDoc = await req.tenantDb!.ThemeConfig.findOne()
    res.json(themeDoc || req.tenant!.theme)
  } catch (err) {
    sendError(res, err, 'Failed to fetch theme', 'get theme')
  }
})

const THEME_COLOR_KEYS = ['primaryColor', 'accentColor', 'backgroundColor'] as const
const THEME_TEXT_KEYS = ['fontDisplay', 'fontSans', 'heroHeadline', 'heroSubhead', 'heroCtaText', 'secondaryCtaText', 'discountCode'] as const
const THEME_FLAG_KEYS = ['enableAnimations', 'enableReviews', 'enableOrderTracking'] as const
const HOME_SECTION_IDS = ['trustBar', 'bestsellers', 'categories', 'featured', 'triptych', 'mission'] as const
const PDP_OPTION_IDS = ['zoom', 'guarantee', 'details', 'shipping', 'related'] as const

function themeFields(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) throw new ValidationError('Request body must be a JSON object.')
  const out: Record<string, unknown> = {}
  for (const key of THEME_COLOR_KEYS) {
    const v = optString(body[key], key, 30)
    if (v !== undefined) {
      if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) throw new ValidationError(`${key} must be a hex colour like #AABBCC.`)
      out[key] = v
    }
  }
  for (const key of THEME_TEXT_KEYS) {
    const v = optString(body[key], key, 300)
    if (v !== undefined) out[key] = v
  }
  for (const key of THEME_FLAG_KEYS) {
    const v = optBoolean(body[key], key)
    if (v !== undefined) out[key] = v
  }
  for (const key of ['heroImage', 'logoUrl'] as const) {
    const v = optImageUrl(body[key], key)
    if (v !== undefined) out[key] = v
  }
  const announcements = optStringArray(body.announcementMessages, 'announcementMessages', 10, 200)
  if (announcements) out.announcementMessages = announcements
  const percent = optNumber(body.discountPercent, 'discountPercent', { min: 0, max: 90 })
  if (percent !== undefined) out.discountPercent = percent
  const threshold = optNumber(body.freeShippingThreshold, 'freeShippingThreshold', { min: 0, max: 10_000_000 })
  if (threshold !== undefined) out.freeShippingThreshold = threshold
  const fee = optNumber(body.shippingFee, 'shippingFee', { min: 0, max: 100_000 })
  if (fee !== undefined) out.shippingFee = fee

  if (body.copy !== undefined) {
    if (!isPlainObject(body.copy)) throw new ValidationError('copy must be an object.')
    const keys = Object.keys(body.copy)
    if (keys.length > 40) throw new ValidationError('copy has too many fields.')
    const copy: Record<string, string> = {}
    for (const key of keys) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key)) throw new ValidationError('copy has an invalid field.')
      const value = optString(body.copy[key], `copy.${key}`, 2000)
      if (value) copy[key] = value
    }
    out.copy = copy
  }
  if (body.trustItems !== undefined) {
    if (!Array.isArray(body.trustItems) || body.trustItems.length > 8) throw new ValidationError('trustItems must be a list of at most 8 items.')
    out.trustItems = body.trustItems.map((item, i) => {
      if (!isPlainObject(item)) throw new ValidationError(`trustItems[${i}] is invalid.`)
      return {
        icon: optString(item.icon, `trustItems[${i}].icon`, 8) || '',
        text: reqString(item.text, `trustItems[${i}].text`, 80),
      }
    })
  }
  if (body.homeSections !== undefined) {
    if (!Array.isArray(body.homeSections) || body.homeSections.length > 8) throw new ValidationError('homeSections must be a list of at most 8 items.')
    out.homeSections = body.homeSections.map((item, i) => {
      if (!isPlainObject(item)) throw new ValidationError(`homeSections[${i}] is invalid.`)
      const id = reqString(item.id, `homeSections[${i}].id`, 40)
      if (!(HOME_SECTION_IDS as readonly string[]).includes(id)) throw new ValidationError(`homeSections[${i}].id is invalid.`)
      return { id, visible: optBoolean(item.visible, `homeSections[${i}].visible`) !== false }
    })
  }
  if (body.pdpOptions !== undefined) {
    if (!isPlainObject(body.pdpOptions)) throw new ValidationError('pdpOptions must be an object.')
    const pdp: Record<string, boolean> = {}
    for (const id of PDP_OPTION_IDS) {
      const value = optBoolean(body.pdpOptions[id], `pdpOptions.${id}`)
      if (value !== undefined) pdp[id] = value
    }
    out.pdpOptions = pdp
  }
  if (body.footerOptions !== undefined) {
    if (!isPlainObject(body.footerOptions)) throw new ValidationError('footerOptions must be an object.')
    out.footerOptions = {
      trustStrip: optBoolean(body.footerOptions.trustStrip, 'footerOptions.trustStrip') !== false,
      newsletter: optBoolean(body.footerOptions.newsletter, 'footerOptions.newsletter') !== false,
    }
  }
  if (body.socialLinks !== undefined) {
    if (!isPlainObject(body.socialLinks)) throw new ValidationError('socialLinks must be an object.')
    const social: Record<string, string> = {}
    for (const key of ['instagram', 'whatsapp', 'pinterest', 'facebook'] as const) {
      const value = optString(body.socialLinks[key], `socialLinks.${key}`, 500)
      if (value !== undefined) social[key] = value
    }
    out.socialLinks = social
  }
  return out
}

function storefrontProfileFields(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) return {}
  const out: Record<string, unknown> = {}
  const brandName = optString(body.brandName, 'brandName', 80)
  if (brandName) out.brandName = brandName
  const tagline = optString(body.tagline, 'tagline', 200)
  if (tagline !== undefined) out.tagline = tagline
  const aboutStory = optString(body.aboutStory, 'aboutStory', 4000)
  if (aboutStory !== undefined) out.aboutStory = aboutStory
  const logo = optImageUrl(body.logo, 'logo')
  if (logo !== undefined) out.logo = logo
  if (body.contact !== undefined) {
    if (!isPlainObject(body.contact)) throw new ValidationError('contact must be an object.')
    const email = optString(body.contact.email, 'contact.email', 254) || ''
    if (email && !EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid contact email address.')
    out.contact = {
      phone: optString(body.contact.phone, 'contact.phone', 30) || '',
      email,
      address: optString(body.contact.address, 'contact.address', 300) || '',
      workingHours: optString(body.contact.workingHours, 'contact.workingHours', 80) || '',
      shippingThresholdFormatted: optString(body.contact.shippingThresholdFormatted, 'contact.shippingThresholdFormatted', 40) || '',
    }
  }
  return out
}

// PUT update theme & hero picture — store owner only
router.put('/theme', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const updates = themeFields(req.body)
    const code = typeof updates.discountCode === 'string' ? updates.discountCode.trim() : ''
    const percent = typeof updates.discountPercent === 'number' ? updates.discountPercent : 0
    if ((code || percent > 0) && !planAllows(normalizePlanId(req.tenant!.plan), 'coupons')) {
      res.status(403).json({ error: 'Discount codes are included with Growth Pro.', upgradeRequired: true })
      return
    }
    const ThemeConfig = req.tenantDb!.ThemeConfig
    const savedTheme = await ThemeConfig.findOneAndUpdate({}, { $set: updates }, { new: true, upsert: true, runValidators: true })

    const profile = storefrontProfileFields(req.body)
    const masterDb = await connectMasterDatabase()
    const mirror = Object.fromEntries(Object.entries(updates).map(([k, v]) => [`theme.${k}`, v]))
    await getTenantModel(masterDb).updateOne({ slug: req.tenant!.slug }, { $set: { ...mirror, ...profile } })

    res.json({ success: true, theme: savedTheme?.toObject ? savedTheme.toObject() : savedTheme, store: profile })
  } catch (err) {
    sendError(res, err, 'Failed to update theme', 'update theme')
  }
})

// ====================================================================
// 3. ORDERS (Isolated per tenant database)
// ====================================================================

// GET orders — store staff only (contains customer names, phones and addresses). Paginated.
router.get('/orders', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const status = queryString(req.query.status)
    const filter = status ? { status } : {}
    const { limit, skip } = pagination(req.query, 50, 200)
    const [orders, total] = await Promise.all([
      req.tenantDb!.Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      req.tenantDb!.Order.countDocuments(filter),
    ])
    res.setHeader('X-Total-Count', String(total))
    res.json(orders)
  } catch (err) {
    sendError(res, err, 'Failed to fetch orders', 'list orders')
  }
})

// GET order tracking — public, but only with the order id AND the phone number used at checkout.
// Returns no other customer's data and the same 404 for "wrong id" and "wrong phone".
router.get('/orders/track', checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const id = queryString(req.query.id, 40)
    const phone = queryString(req.query.phone, 30)
    if (!id || !phone) {
      res.status(400).json({ error: 'Order id and phone number are required.' })
      return
    }
    const order = await req.tenantDb!.Order.findOne({ id: id.trim().toUpperCase() })
    if (!order || normalizePhone(order.shippingAddress.phone) !== normalizePhone(phone) || normalizePhone(phone).length < 10) {
      res.status(404).json({ error: 'No order matches that id and phone number.' })
      return
    }
    res.json({
      id: order.id,
      date: order.date,
      status: order.status,
      courier: order.courier,
      awb: order.awb,
      estimatedDelivery: order.estimatedDelivery,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      total: order.total,
      paymentMethod: order.paymentMethod,
      timeline: order.timeline,
      shippingAddress: { name: order.shippingAddress.name, city: order.shippingAddress.city, pincode: order.shippingAddress.pincode },
    })
  } catch (err) {
    sendError(res, err, 'Failed to look up order', 'track order')
  }
})

const PAYMENT_METHODS = ['UPI', 'COD', 'Card', 'NetBanking'] as const

function newOrderId(): string {
  const day = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `ORD-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

/**
 * POST place order — public (customers check out on the storefront).
 * The client sends only product ids, quantities, options and the delivery address.
 * Prices, totals, discount, shipping, status and the order id are computed here; stock is
 * reserved atomically so two shoppers cannot buy the last unit.
 */
router.post('/orders', checkoutLimiter, async (req: Request, res: Response) => {
  if (req.tenant!.status === 'read_only') {
    res.status(403).json({ error: 'This store is not taking new orders right now.', readOnly: true })
    return
  }
  const reserved: Array<{ id: number; quantity: number }> = []
  const Product = req.tenantDb!.Product
  try {
    const body = req.body
    if (!isPlainObject(body)) throw new ValidationError('Request body must be a JSON object.')
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      throw new ValidationError('An order needs between 1 and 50 items.')
    }

    const addr = isPlainObject(body.shippingAddress) ? body.shippingAddress : {}
    const shippingAddress = {
      name: reqString(addr.name, 'shippingAddress.name', 100),
      phone: reqString(addr.phone, 'shippingAddress.phone', 20),
      address: reqString(addr.address, 'shippingAddress.address', 500),
      city: reqString(addr.city, 'shippingAddress.city', 100),
      state: reqString(addr.state, 'shippingAddress.state', 100),
      pincode: reqString(addr.pincode, 'shippingAddress.pincode', 10),
    }
    if (normalizePhone(shippingAddress.phone).length !== 10) throw new ValidationError('Enter a valid 10-digit phone number.')
    if (!/^\d{6}$/.test(shippingAddress.pincode)) throw new ValidationError('Enter a valid 6-digit PIN code.')
    const customerEmail = optString(body.customerEmail, 'customerEmail', 254)
    if (customerEmail && !EMAIL_PATTERN.test(customerEmail)) throw new ValidationError('Enter a valid email address.')
    const paymentMethod = optString(body.paymentMethod, 'paymentMethod', 20) || 'UPI'
    if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) throw new ValidationError('Unsupported payment method.')

    // Merge duplicate lines for the same product + options, then validate against this store's catalog.
    const lines = new Map<string, { productId: number; quantity: number; size: string; lining?: string; zip?: string; length?: string }>()
    body.items.forEach((raw: unknown, i: number) => {
      if (!isPlainObject(raw)) throw new ValidationError(`items[${i}] is invalid.`)
      const productId = reqNumber(raw.productId ?? raw.id, `items[${i}].productId`, { min: 1, integer: true })
      const quantity = reqNumber(raw.quantity, `items[${i}].quantity`, { min: 1, max: 99, integer: true })
      const line = {
        productId,
        quantity,
        size: optString(raw.size, `items[${i}].size`, 30) || '',
        lining: optString(raw.lining, `items[${i}].lining`, 50),
        zip: optString(raw.zip, `items[${i}].zip`, 50),
        length: optString(raw.length, `items[${i}].length`, 50),
      }
      const key = JSON.stringify([productId, line.size, line.lining, line.zip, line.length])
      const prev = lines.get(key)
      if (prev) prev.quantity += quantity
      else lines.set(key, line)
    })

    const ids = [...new Set([...lines.values()].map((l) => l.productId))]
    const products = new Map((await Product.find({ id: { $in: ids } })).map((p) => [p.id, p]))
    const items: IOrderItem[] = []
    for (const line of lines.values()) {
      const product = products.get(line.productId)
      if (!product) {
        res.status(400).json({ error: 'One of the products in your cart is no longer available in this store.', productId: line.productId })
        return
      }
      if (line.size && product.sizes?.length && !product.sizes.includes(line.size)) {
        throw new ValidationError(`Size "${line.size}" is not available for ${product.name}.`)
      }
      items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: line.quantity,
        size: line.size,
        lining: line.lining,
        zip: line.zip,
        length: line.length,
        image: product.imgMain || '',
      })
    }

    // Reserve stock per product; roll back on the first shortfall.
    const qtyByProduct = new Map<number, number>()
    for (const item of items) qtyByProduct.set(item.productId!, (qtyByProduct.get(item.productId!) || 0) + item.quantity)
    for (const [id, quantity] of qtyByProduct) {
      const result = await Product.updateOne({ id, stockCount: { $gte: quantity } }, { $inc: { stockCount: -quantity } })
      if (result.modifiedCount !== 1) {
        const p = products.get(id)!
        const error = (p.stockCount ?? 0) > 0 ? `Only ${p.stockCount} of ${p.name} left in stock.` : `${p.name} is out of stock.`
        res.status(409).json({ error, productId: id })
        await releaseStock(req, reserved)
        return
      }
      reserved.push({ id, quantity })
    }

    const theme: Record<string, any> = (await req.tenantDb!.ThemeConfig.findOne())?.toObject() || req.tenant!.theme || {}
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
    const code = optString(body.discountCode, 'discountCode', 40)?.toUpperCase()
    const storeCode = String(theme.discountCode || '').toUpperCase()
    const percent = Math.min(Math.max(Number(theme.discountPercent) || 0, 0), 90)
    const discount = code && storeCode && code === storeCode ? Math.round((subtotal * percent) / 100) : 0
    const threshold = Number(theme.freeShippingThreshold ?? 999)
    const fee = Number(theme.shippingFee ?? 70)
    const shipping = fee <= 0 || subtotal >= threshold ? 0 : fee
    const now = new Date()
    const eta = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

    const order = await new req.tenantDb!.Order({
      id: newOrderId(),
      date: now.toISOString(),
      status: 'Processing',
      courier: '',
      awb: '',
      estimatedDelivery: eta.toISOString().slice(0, 10),
      subtotal,
      discount,
      discountCode: discount > 0 ? code : '',
      shipping,
      total: Math.max(subtotal - discount + shipping, 0),
      paymentMethod,
      customerEmail: customerEmail || '',
      shippingAddress,
      items,
      timeline: [{ title: 'Order Placed', time: now.toISOString(), desc: 'We have received your order.', completed: true }],
    }).save()

    if (customerEmail) {
      await collectSubscriber(req, customerEmail, 'checkout').catch(() => undefined)
    }
    req.tenantDb!.StoreEvent.create({
      type: 'order_placed',
      path: '/checkout',
      sessionId: optString(body.sessionId, 'sessionId', 80) || '',
    }).catch(() => undefined)
    res.status(201).json(order)
  } catch (err) {
    await releaseStock(req, reserved)
    sendError(res, err, 'Failed to place order', 'place order')
  }
})

async function releaseStock(req: Request, reserved: Array<{ id: number; quantity: number }>): Promise<void> {
  for (const r of reserved.splice(0)) {
    await req.tenantDb!.Product.updateOne({ id: r.id }, { $inc: { stockCount: r.quantity } }).catch((e) =>
      console.error('[Store API] Failed to release stock for product', r.id, e)
    )
  }
}

const ORDER_STATUSES = ['Processing', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'] as const
const STATUS_DESCRIPTIONS: Record<string, string> = {
  Processing: 'Your order is being prepared.',
  'In Transit': 'Your order has been handed to the courier.',
  'Out for Delivery': 'Your order is out for delivery today.',
  Delivered: 'Your order has been delivered.',
  Cancelled: 'This order was cancelled.',
}

// PUT order status — store staff (fulfilment) or owner
router.put('/orders/:id/status', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const status = optString(body.status, 'status', 30)
    if (!status || !(ORDER_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError(`status must be one of: ${ORDER_STATUSES.join(', ')}.`)
    }
    const courier = optString(body.courier, 'courier', 100)
    const awb = optString(body.awb, 'awb', 100)

    const Order = req.tenantDb!.Order
    const order = await Order.findOne({ id: String(req.params.id) })
    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }
    if (order.status === 'Delivered' || order.status === 'Cancelled') {
      if (order.status !== status) {
        res.status(409).json({ error: `This order is already ${order.status.toLowerCase()} and can no longer change status.` })
        return
      }
    }

    const update: Record<string, unknown> = { status }
    if (courier !== undefined) update.courier = courier
    if (awb !== undefined) update.awb = awb
    const push =
      order.status !== status
        ? { timeline: { title: status, time: new Date().toISOString(), desc: STATUS_DESCRIPTIONS[status], completed: true } }
        : undefined

    if (status === 'Cancelled' && !order.stockRestored) {
      // Claim the restock atomically so a double-submitted cancel cannot add stock twice.
      const claimed = await Order.findOneAndUpdate(
        { id: order.id, stockRestored: { $ne: true } },
        { $set: { ...update, stockRestored: true }, ...(push ? { $push: push } : {}) },
        { new: true }
      )
      if (claimed) {
        for (const item of claimed.items) {
          if (item.productId) await req.tenantDb!.Product.updateOne({ id: item.productId }, { $inc: { stockCount: item.quantity } })
        }
        res.json(claimed)
        return
      }
    }

    const updated = await Order.findOneAndUpdate({ id: order.id }, { $set: update, ...(push ? { $push: push } : {}) }, { new: true })
    res.json(updated)
  } catch (err) {
    sendError(res, err, 'Failed to update order', 'update order status')
  }
})

// ====================================================================
// 4. REVIEWS
// ====================================================================

router.get('/reviews', async (req: Request, res: Response) => {
  try {
    const filter: Record<string, unknown> = {}
    const productId = queryString(req.query.productId)
    if (productId) filter.productId = parseProductId(productId)
    const { limit, skip } = pagination(req.query, 50, 200)
    const reviews = await req.tenantDb!.Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
    res.json(reviews)
  } catch (err) {
    sendError(res, err, 'Failed to fetch reviews', 'list reviews')
  }
})

// POST create review — public. Reviews are never marked "verified" by the submitter.
router.post('/reviews', checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const productId = reqNumber(body.productId, 'productId', { min: 1, integer: true })
    if (!(await req.tenantDb!.Product.exists({ id: productId }))) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    const fields = {
      productId,
      author: reqString(body.author, 'author', 80),
      rating: reqNumber(body.rating, 'rating', { min: 1, max: 5, integer: true }),
      title: optString(body.title, 'title', 150) || '',
      comment: reqString(body.comment, 'comment', 2000),
      date: new Date().toISOString().slice(0, 10),
      verified: false,
    }

    const Review = req.tenantDb!.Review
    for (let attempt = 0; attempt < 5; attempt++) {
      const highest = await Review.findOne().sort({ id: -1 }).select('id')
      try {
        const saved = await new Review({ ...fields, id: (highest?.id || 0) + 1 }).save()
        res.status(201).json(saved)
        return
      } catch (err: any) {
        if (err?.code !== 11000) throw err
      }
    }
    res.status(503).json({ error: 'Could not save the review. Please retry.' })
  } catch (err) {
    sendError(res, err, 'Failed to create review', 'create review')
  }
})

// ====================================================================
// 5. DATABASE SETTINGS (Bring-Your-Own-Database / Custom Mongo URI)
// ====================================================================

// GET database connection status — store staff only; never reveals hosts or connection strings.
router.get('/database-status', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const conn = req.tenantDb!.connection
    const [products, orders, reviews] = await Promise.all([
      req.tenantDb!.Product.countDocuments(),
      req.tenantDb!.Order.countDocuments(),
      req.tenantDb!.Review.countDocuments(),
    ])
    res.json({
      tenantSlug: req.tenant!.slug,
      brandName: req.tenant!.brandName,
      isCustomDatabase: Boolean(req.tenant!.customMongoUri),
      isolationMode: req.tenant!.customMongoUri ? 'dedicated_atlas_cluster' : 'dedicated_database',
      databaseName: conn.name,
      connected: conn.readyState === 1,
      stats: { products, orders, reviews },
    })
  } catch (err) {
    sendError(res, err, 'Failed to inspect database', 'database status')
  }
})

// PUT update custom MongoDB URI (Bring-Your-Own-Database) — store owner only
router.put('/database-config', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const slug = req.tenant!.slug
    const cleanUri = optString(body.customMongoUri, 'customMongoUri', 1000) || ''
    // Connecting to a merchant-supplied host lets the server be pointed at internal addresses,
    // so bring-your-own-database is opt-in per deployment and limited to SRV (DNS-published) clusters.
    if (cleanUri && process.env.ALLOW_CUSTOM_DATABASES !== 'true') {
      res.status(403).json({ error: 'Custom databases are not enabled on this platform.' })
      return
    }
    if (cleanUri && !/^mongodb\+srv:\/\/[^\s/]+\/?[^\s]*$/.test(cleanUri)) {
      throw new ValidationError('customMongoUri must be a mongodb+srv:// connection string (for example MongoDB Atlas).')
    }

    if (cleanUri) {
      try {
        const testConn = await getTenantConnection(`${slug}_test`, cleanUri)
        await testConn.close()
      } catch {
        res.status(400).json({ error: 'Could not connect to the provided MongoDB database. Check the connection string and network access.' })
        return
      }
    }

    const masterDb = await connectMasterDatabase()
    await getTenantModel(masterDb).updateOne({ slug }, { $set: { customMongoUri: cleanUri } })
    await closeTenantConnection(slug)

    res.json({
      success: true,
      isCustomDatabase: Boolean(cleanUri),
      message: cleanUri
        ? 'Connected and switched this store to your own database.'
        : 'Switched back to the Orvexa platform database.',
    })
  } catch (err) {
    sendError(res, err, 'Failed to update database config', 'database config')
  }
})

// ====================================================================
// 6. STOREFRONT EVENTS & SELLER ANALYTICS
// ====================================================================

const eventLimiter = rateLimit({
  skip: () => process.env.DISABLE_RATE_LIMITS === 'true' && process.env.NODE_ENV !== 'production',
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
})

router.post('/events', eventLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const type = optString(body.type, 'type', 40)
    if (!type || !(STORE_EVENT_TYPES as readonly string[]).includes(type) || type === 'order_placed') {
      throw new ValidationError('type must be page_view, shopper_signin or shopper_register.')
    }
    await req.tenantDb!.StoreEvent.create({
      type,
      path: (optString(body.path, 'path', 300) || '/').slice(0, 300),
      sessionId: optString(body.sessionId, 'sessionId', 80) || '',
    })
    res.status(204).end()
  } catch (err) {
    sendError(res, err, 'Failed to record event', 'store event')
  }
})

router.get('/analytics', ...staffOfTenant, async (req: Request, res: Response) => {
  if (!planAllows(normalizePlanId(req.tenant!.plan), 'analytics')) {
    res.status(403).json({ error: 'Store analytics are included with Growth Pro.', upgradeRequired: true })
    return
  }
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const Event = req.tenantDb!.StoreEvent
    const Order = req.tenantDb!.Order
    const [events, orders] = await Promise.all([
      Event.find({ createdAt: { $gte: since } }).select('type sessionId createdAt').lean(),
      Order.find({ createdAt: { $gte: since } }).select('total createdAt date').lean(),
    ])

    const dayKey = (d: Date) => d.toISOString().slice(0, 10)
    const byDay: Record<string, { date: string; pageViews: number; visitors: number; signIns: number; orders: number; revenue: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const date = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
      byDay[date] = { date, pageViews: 0, visitors: 0, signIns: 0, orders: 0, revenue: 0 }
    }
    const visitorsByDay = new Map<string, Set<string>>()
    const visitorIds = new Set<string>()
    let pageViews = 0
    let signIns = 0
    for (const ev of events) {
      const date = dayKey(new Date(ev.createdAt as Date))
      const bucket = byDay[date]
      if (ev.type === 'page_view') {
        pageViews++
        if (bucket) bucket.pageViews++
        const sid = String(ev.sessionId || '')
        if (sid) {
          visitorIds.add(sid)
          if (bucket) {
            const set = visitorsByDay.get(date) || new Set()
            set.add(sid)
            visitorsByDay.set(date, set)
          }
        }
      } else if (ev.type === 'shopper_signin' || ev.type === 'shopper_register') {
        signIns++
        if (bucket) bucket.signIns++
      }
    }
    let orderCount = 0
    let revenue = 0
    for (const o of orders) {
      const date = dayKey(new Date((o as any).createdAt || (o as any).date || 0))
      const bucket = byDay[date]
      const total = Number((o as any).total) || 0
      orderCount++
      revenue += total
      if (bucket) {
        bucket.orders++
        bucket.revenue += total
      }
    }
    for (const [date, set] of visitorsByDay) {
      if (byDay[date]) byDay[date].visitors = set.size
    }

    res.json({
      days,
      pageViews,
      visitors: visitorIds.size,
      signIns,
      orders: orderCount,
      revenue,
      byDay: Object.values(byDay),
      storefrontPath: `/t/${req.tenant!.slug}`,
      dashboardPath: `/t/${req.tenant!.slug}/dashboard`,
      customDomain: req.tenant!.customDomain || '',
      customDomainVerified: Boolean(req.tenant!.customDomainVerified),
    })
  } catch (err) {
    sendError(res, err, 'Failed to load analytics', 'analytics')
  }
})

router.get('/domain', ...staffOfTenant, async (req: Request, res: Response) => {
  const slug = req.tenant!.slug
  const domain = req.tenant!.customDomain || ''
  res.json({
    portalUrl: `https://${PLATFORM_ROOT_DOMAIN}/t/${slug}`,
    dashboardUrl: `https://${PLATFORM_ROOT_DOMAIN}/t/${slug}/dashboard`,
    customDomain: domain,
    verified: Boolean(req.tenant!.customDomainVerified),
    verifiedAt: req.tenant!.customDomainVerifiedAt || '',
    cnameTarget: platformCnameTarget(),
    records: [
      { type: 'CNAME', name: domain ? domain.replace(/^www\./, '') : 'www', value: platformCnameTarget(), note: 'Point the storefront hostname at Orvexa. Proxy/CDN orange-cloud is fine once SSL is issued.' },
    ],
  })
})

router.put('/domain', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const raw = optString(body.customDomain, 'customDomain', 253) || ''
    const host = raw ? normalizeHostname(raw) : ''
    if (host && !isValidPublicHostname(host)) {
      throw new ValidationError('Enter a domain like shop.yourbrand.in (not an Orvexa address or localhost).')
    }
    if (host && !planAllows(normalizePlanId(req.tenant!.plan), 'customDomain')) {
      res.status(403).json({ error: 'A custom domain is included with Growth Pro.', upgradeRequired: true })
      return
    }

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    if (host) {
      const taken = await Tenant.exists({
        slug: { $ne: req.tenant!.slug },
        customDomain: { $in: hostLookupKeys(host) },
      })
      if (taken) {
        res.status(409).json({ error: 'That domain is already connected to another store.' })
        return
      }
    }

    const verified = host ? await domainPointsAtPlatform(host) : false
    const updated = await Tenant.findOneAndUpdate(
      { slug: req.tenant!.slug },
      {
        $set: {
          customDomain: host,
          customDomainVerified: verified,
          customDomainVerifiedAt: verified ? new Date().toISOString() : '',
        },
      },
      { new: true }
    )
    res.json({
      customDomain: host,
      verified,
      cnameTarget: platformCnameTarget(),
      message: !host
        ? 'Custom domain removed. Shoppers use the Orvexa portal address.'
        : verified
          ? `${host} is pointing at Orvexa and will serve this storefront.`
          : `${host} is saved. Create a CNAME to ${platformCnameTarget()} (DNS only), wait for it to publish, then check again.`,
    })
    void updated
  } catch (err) {
    sendError(res, err, 'Failed to update domain', 'domain')
  }
})

// ====================================================================
// 7. STAFF MANAGEMENT (Merchant manages their own store's staff)
// ====================================================================

router.get('/staff', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const staff = (req.tenant!.staffMembers || []).map(({ id, name, email, role, createdAt }) => ({ id, name, email, role, createdAt }))
    res.json({ staff })
  } catch (err) {
    sendError(res, err, 'Failed to fetch staff', 'list staff')
  }
})

router.post('/staff', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const name = reqString(body.name, 'name', 100)
    const email = reqString(body.email, 'email', 254).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    const role = optString(body.role, 'role', 20) || 'staff'
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
    if (password.length < 8 || password.length > 200) throw new ValidationError('Password must be 8-200 characters.')
    if (!['staff', 'manager'].includes(role)) throw new ValidationError('role must be "staff" or "manager".')

    const masterDb = await connectMasterDatabase()
    const Tenant = getTenantModel(masterDb)
    // Staff log in by email alone, so an email may belong to only one staff account platform-wide.
    if (await Tenant.exists({ $or: [{ 'staffMembers.email': email }, { ownerEmail: email }] })) {
      res.status(409).json({ error: 'This email is already used by another account.' })
      return
    }

    const newStaff = {
      id: `staff_${crypto.randomBytes(6).toString('hex')}`,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      createdAt: new Date().toISOString(),
    }
    await Tenant.updateOne({ slug: req.tenant!.slug }, { $push: { staffMembers: newStaff } })

    const { passwordHash: _p, ...safe } = newStaff
    res.status(201).json({ success: true, staff: safe })
  } catch (err) {
    sendError(res, err, 'Failed to add staff member', 'add staff')
  }
})

router.delete('/staff/:staffId', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const masterDb = await connectMasterDatabase()
    const result = await getTenantModel(masterDb).updateOne(
      { slug: req.tenant!.slug },
      { $pull: { staffMembers: { id: String(req.params.staffId) } } }
    )
    if (result.modifiedCount === 0) {
      res.status(404).json({ error: 'Staff member not found.' })
      return
    }
    await getRefreshTokenModel(masterDb).deleteMany({ userId: String(req.params.staffId), tenantSlug: req.tenant!.slug })
    res.json({ success: true, message: 'Staff member removed.' })
  } catch (err) {
    sendError(res, err, 'Failed to remove staff member', 'remove staff')
  }
})

router.post('/billing/checkout', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const checkout = await createSubscriptionCheckout(req.tenant!)
    res.json(checkout)
  } catch (err) {
    const message = (err as Error).message || 'Could not start checkout.'
    const status = message.includes('not configured') ? 503 : 400
    res.status(status).json({ error: message })
  }
})

router.get('/export', ...ownerOfTenant, async (req: Request, res: Response) => {
  try {
    const data = await buildStoreExport(req.tenant!)
    res.setHeader('Content-Disposition', `attachment; filename="${req.tenant!.slug}-export.json"`)
    res.json(data)
  } catch (err) {
    sendError(res, err, 'Failed to export store data', 'export')
  }
})

// ====================================================================
// 8. STOREFRONT INBOX & NEWSLETTER (public capture, staff read)
// ====================================================================

function serializeMessage(doc: { id?: string; name: string; email: string; phone: string; subject: string; message: string; read: boolean; createdAt: Date; toObject?: (opts?: object) => Record<string, unknown> }) {
  const obj = (typeof doc.toObject === 'function' ? doc.toObject({ virtuals: false }) : doc) as {
    id?: string
    name: string
    email: string
    phone?: string
    subject?: string
    message: string
    read?: boolean
    createdAt: Date | string
  }
  return {
    id: String(obj.id || ''),
    name: obj.name,
    email: obj.email,
    phone: obj.phone || '',
    subject: obj.subject || '',
    message: obj.message,
    read: Boolean(obj.read),
    createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : String(obj.createdAt),
  }
}

const SHOPPER_CODE_MS = 10 * 60 * 1000
const SHOPPER_RESEND_MS = 30 * 1000
const SHOPPER_MAX_ATTEMPTS = 5

function shopperCodeHash(email: string, code: string): string {
  const pepper = process.env.JWT_SECRET || ''
  return crypto.createHash('sha256').update(`${email}:${code}:${pepper}`).digest('hex')
}

function shopperHashesMatch(stored: string, incoming: string): boolean {
  const a = Buffer.from(stored || '', 'hex')
  const b = Buffer.from(incoming || '', 'hex')
  if (a.length !== 32 || b.length !== 32 || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function publicShopper(doc: { name: string; email: string; phone?: string }) {
  return { name: doc.name, email: doc.email, phone: doc.phone || '', verified: true }
}

const shopperLimiter = rateLimit({
  skip: () => process.env.DISABLE_RATE_LIMITS === 'true' && process.env.NODE_ENV !== 'production',
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tries. Wait a minute and try again.' },
})

async function issueShopperCode(
  req: Request,
  email: string,
  fields: { name: string; phone: string; passwordHash: string }
): Promise<{ error?: string; retryAfterSeconds?: number }> {
  const Shopper = req.tenantDb!.Shopper
  const existing = await Shopper.findOne({ email })
  if (existing?.emailVerified) return { error: 'An account with this email already exists. Please sign in instead.' }

  const now = Date.now()
  if (existing?.lastCodeSentAt && now - existing.lastCodeSentAt.getTime() < SHOPPER_RESEND_MS) {
    return { retryAfterSeconds: Math.ceil((SHOPPER_RESEND_MS - (now - existing.lastCodeSentAt.getTime())) / 1000) }
  }

  const code = String(crypto.randomInt(100000, 1000000))
  const verifyCodeHash = shopperCodeHash(email, code)
  const verifyExpires = new Date(now + SHOPPER_CODE_MS)
  await Shopper.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        name: fields.name,
        phone: fields.phone,
        passwordHash: fields.passwordHash,
        emailVerified: false,
        verifyCodeHash,
        verifyExpires,
        verifyAttempts: 0,
        lastCodeSentAt: new Date(now),
      },
    },
    { upsert: true, new: true }
  )

  const brand = req.tenant!.brandName
  const sent = await sendEmail({
    to: email,
    subject: `Your ${brand} verification code`,
    text: [
      `Hi ${fields.name || 'there'},`,
      '',
      `Your 6-digit verification code for ${brand} is ${code}.`,
      'It expires in 10 minutes. If you did not create this account, ignore this email.',
    ].join('\n'),
    idempotencyKey: `shopper-verify-${req.tenant!.slug}-${email}-${Math.floor(now / SHOPPER_RESEND_MS)}`,
  })
  if (!sent && process.env.NODE_ENV === 'production') {
    return { error: 'We could not send the verification email. Try again shortly.' }
  }
  return {}
}

router.post('/shoppers/register', shopperLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const name = reqString(body.name, 'name', 120)
    const email = reqString(body.email, 'email', 254).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
    const phone = optString(body.phone, 'phone', 20) || ''
    const password = reqString(body.password, 'password', 200, 8)

    const result = await issueShopperCode(req, email, {
      name,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
    })
    if (result.error) {
      res.status(result.error.startsWith('An account') ? 409 : 503).json({ error: result.error })
      return
    }
    if (result.retryAfterSeconds) {
      res.status(429).json({ error: `Wait ${result.retryAfterSeconds}s before requesting another code.`, retryAfterSeconds: result.retryAfterSeconds })
      return
    }
    res.json({ sent: true })
  } catch (err) {
    sendError(res, err, 'Could not start email verification', 'shopper register')
  }
})

router.post('/shoppers/resend', shopperLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const email = reqString(body.email, 'email', 254).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
    const pending = await req.tenantDb!.Shopper.findOne({ email, emailVerified: false })
    if (!pending?.passwordHash) {
      res.json({ sent: true })
      return
    }
    const result = await issueShopperCode(req, email, {
      name: pending.name,
      phone: pending.phone || '',
      passwordHash: pending.passwordHash,
    })
    if (result.error) {
      res.status(503).json({ error: result.error })
      return
    }
    if (result.retryAfterSeconds) {
      res.status(429).json({ error: `Wait ${result.retryAfterSeconds}s before requesting another code.`, retryAfterSeconds: result.retryAfterSeconds })
      return
    }
    res.json({ sent: true })
  } catch (err) {
    sendError(res, err, 'Could not resend the code', 'shopper resend')
  }
})

router.post('/shoppers/verify', shopperLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const email = reqString(body.email, 'email', 254).toLowerCase()
    const code = reqString(body.code, 'code', 6, 6)
    if (!/^\d{6}$/.test(code)) throw new ValidationError('Enter the 6-digit code from your email.')

    const Shopper = req.tenantDb!.Shopper
    const shopper = await Shopper.findOne({ email })
    if (!shopper || shopper.emailVerified) {
      res.status(400).json({ error: 'Invalid or expired verification code.' })
      return
    }
    if (!shopper.verifyExpires || shopper.verifyExpires.getTime() < Date.now()) {
      res.status(400).json({ error: 'That code has expired. Request a new one.' })
      return
    }
    if (shopper.verifyAttempts >= SHOPPER_MAX_ATTEMPTS) {
      res.status(429).json({ error: 'Too many attempts. Request a new code.' })
      return
    }
    if (!shopperHashesMatch(shopper.verifyCodeHash, shopperCodeHash(email, code))) {
      shopper.verifyAttempts += 1
      await shopper.save()
      res.status(400).json({ error: 'Invalid verification code. Check the email and try again.' })
      return
    }

    shopper.emailVerified = true
    shopper.verifyCodeHash = ''
    shopper.verifyExpires = null
    shopper.verifyAttempts = 0
    await shopper.save()
    await collectSubscriber(req, email, 'newsletter').catch(() => undefined)
    res.json({ user: publicShopper(shopper) })
  } catch (err) {
    sendError(res, err, 'Could not verify the email', 'shopper verify')
  }
})

router.post('/shoppers/login', shopperLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const email = reqString(body.email, 'email', 254).toLowerCase()
    const password = reqString(body.password, 'password', 200, 1)
    const shopper = await req.tenantDb!.Shopper.findOne({ email })
    if (!shopper?.passwordHash) {
      res.status(401).json({ error: 'No account found with this email. Create an account to continue.' })
      return
    }
    if (!shopper.emailVerified) {
      res.status(403).json({ error: 'Check your email for the 6-digit code, then finish creating your account.' })
      return
    }
    if (!(await bcrypt.compare(password, shopper.passwordHash))) {
      res.status(401).json({ error: 'Incorrect password. Please try again.' })
      return
    }
    res.json({ user: publicShopper(shopper) })
  } catch (err) {
    sendError(res, err, 'Could not sign in', 'shopper login')
  }
})

function serializeSubscriber(doc: { email: string; source?: string; subscribedAt?: Date; createdAt?: Date }) {
  const when = doc.subscribedAt || doc.createdAt
  return {
    email: doc.email,
    source: doc.source || 'newsletter',
    subscribedAt: when instanceof Date ? when.toISOString() : String(when || new Date().toISOString()),
  }
}

router.post('/newsletter', checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const email = reqString(body.email, 'email', 254).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
    const rawSource = optString(body.source, 'source', 20) || 'newsletter'
    const source: SubscriberSource = (SUBSCRIBER_SOURCES as readonly string[]).includes(rawSource)
      ? (rawSource as SubscriberSource)
      : 'newsletter'
    const { created } = await collectSubscriber(req, email, source)
    res.status(created ? 201 : 200).json({ success: true, created, email })
  } catch (err) {
    sendError(res, err, 'Failed to subscribe', 'newsletter')
  }
})

router.post('/contact', checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const name = reqString(body.name, 'name', 120)
    const email = reqString(body.email, 'email', 254).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
    const phone = optString(body.phone, 'phone', 30) || ''
    const subject = optString(body.subject, 'subject', 200) || 'Customer inquiry'
    const message = reqString(body.message, 'message', 4000)

    const saved = await req.tenantDb!.StoreMessage.create({
      id: `msg_${crypto.randomBytes(8).toString('hex')}`,
      name,
      email,
      phone,
      subject,
      message,
      read: false,
    })
    await collectSubscriber(req, email, 'contact').catch(() => undefined)
    res.status(201).json(serializeMessage(saved))
  } catch (err) {
    sendError(res, err, 'Failed to send message', 'contact')
  }
})

router.get('/inbox', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const [messages, subscribers] = await Promise.all([
      req.tenantDb!.StoreMessage.find().sort({ createdAt: -1 }).lean(),
      req.tenantDb!.Subscriber.find().sort({ subscribedAt: -1 }).lean(),
    ])
    res.json({
      messages: messages.map(serializeMessage),
      subscribers: subscribers.map(serializeSubscriber),
    })
  } catch (err) {
    sendError(res, err, 'Failed to load inbox', 'inbox')
  }
})

router.patch('/inbox/messages/:id', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const id = reqString(req.params.id, 'id', 80)
    const body = isPlainObject(req.body) ? req.body : {}
    const read = optBoolean(body.read, 'read')
    if (read === undefined) throw new ValidationError('read is required.')
    const updated = await req.tenantDb!.StoreMessage.findOneAndUpdate({ id }, { $set: { read } }, { new: true })
    if (!updated) {
      res.status(404).json({ error: 'Message not found.' })
      return
    }
    res.json(serializeMessage(updated))
  } catch (err) {
    sendError(res, err, 'Failed to update message', 'inbox read')
  }
})

router.delete('/inbox/messages/:id', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const id = reqString(req.params.id, 'id', 80)
    const deleted = await req.tenantDb!.StoreMessage.findOneAndDelete({ id })
    if (!deleted) {
      res.status(404).json({ error: 'Message not found.' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    sendError(res, err, 'Failed to delete message', 'inbox delete')
  }
})

router.delete('/inbox/subscribers', ...staffOfTenant, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {}
    const email = reqString(body.email, 'email', 254).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
    await req.tenantDb!.Subscriber.deleteOne({ email })
    res.json({ success: true })
  } catch (err) {
    sendError(res, err, 'Failed to remove subscriber', 'unsubscribe')
  }
})

// Unknown store routes return JSON 404 rather than falling through.
router.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: 'Not found' })
})

export default router
