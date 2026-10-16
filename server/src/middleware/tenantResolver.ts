// --- Multi-Tenant Dynamic Database Resolver Middleware ---
// Intercepts requests, resolves the tenant from Master DB, and connects to the tenant's isolated MongoDB database

import type { Request, Response, NextFunction } from 'express'
import type { Connection, Model } from 'mongoose'
import { connectMasterDatabase, getTenantConnection } from '../config/db.js'
import { getTenantModel, type ITenant } from '../models/master/Tenant.js'
import { getTenantProductModel, type IProduct } from '../models/tenant/Product.js'
import { getTenantOrderModel, type IOrder } from '../models/tenant/Order.js'
import {
  getTenantReviewModel,
  getTenantThemeModel,
  getTenantCustomerModel,
  type IReview,
  type IThemeConfigDoc,
  type ICustomerDoc,
} from '../models/tenant/Review.js'
import { SLUG_PATTERN } from '../lib/validate.js'
import { getTenantStoreEventModel, type IStoreEvent } from '../models/tenant/StoreEvent.js'

export interface TenantDbContext {
  connection: Connection
  Product: Model<IProduct>
  Order: Model<IOrder>
  Review: Model<IReview>
  ThemeConfig: Model<IThemeConfigDoc>
  Customer: Model<ICustomerDoc>
  StoreEvent: Model<IStoreEvent>
}

declare global {
  namespace Express {
    interface Request {
      tenant?: ITenant
      tenantDb?: TenantDbContext
    }
  }
}

export async function tenantResolver(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // The store comes from the URL path only. Unknown stores are a 404 — never a fallback to
    // another store, which would let requests (and writes) land in the wrong tenant's database.
    const slug = String(req.params.tenantSlug || '').trim().toLowerCase()
    if (!SLUG_PATTERN.test(slug)) {
      res.status(404).json({ error: 'Store not found.' })
      return
    }

    const masterDb = await connectMasterDatabase()
    const TenantModel = getTenantModel(masterDb)
    const tenant = await TenantModel.findOne({ slug })

    if (!tenant) {
      res.status(404).json({ error: 'Store not found.' })
      return
    }

    try {
      const { applyStoreBilling } = await import('../services/billing.js')
      await applyStoreBilling(tenant)
    } catch (billingErr) {
      console.error('[billing] lifecycle check failed for', slug, (billingErr as Error).message)
    }

    // 3. Enforce tenant status — suspended/pending stores cannot serve or receive data
    if (tenant.status === 'suspended') {
      res.status(403).json({ error: 'This store has been suspended. Please contact support.' })
      return
    }

    if (tenant.status === 'pending') {
      res.status(403).json({ error: 'This store is pending approval and not yet active.' })
      return
    }

    if (tenant.status === 'cancelled') {
      res.status(403).json({ error: 'This store has closed.' })
      return
    }

    // 4. Connect to the tenant's dedicated database (custom Mongo URI or provisioned multi-db)
    const tenantConn = await getTenantConnection(tenant.slug, tenant.customMongoUri)

    // 4. Attach scoped models to request
    req.tenant = tenant
    req.tenantDb = {
      connection: tenantConn,
      Product: getTenantProductModel(tenantConn),
      Order: getTenantOrderModel(tenantConn),
      Review: getTenantReviewModel(tenantConn),
      ThemeConfig: getTenantThemeModel(tenantConn),
      Customer: getTenantCustomerModel(tenantConn),
      StoreEvent: getTenantStoreEventModel(tenantConn),
    }

    next()
  } catch (error) {
    console.error('[Tenant Resolver Error]:', error)
    res.status(503).json({ error: 'The store is temporarily unavailable. Please try again shortly.' })
  }
}
