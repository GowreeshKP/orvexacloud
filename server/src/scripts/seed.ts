// --- Database Seeder Script ---
// Seeds Master Database (orvexatech_master) and Isolated Tenant Databases with initial datasets

import { connectMasterDatabase, getTenantConnection, masterConnection } from '../config/db.js'
import { getTenantModel } from '../models/master/Tenant.js'
import { getApplicationModel } from '../models/master/Application.js'
import { getAdminUserModel } from '../models/master/AdminUser.js'
import { getTenantProductModel } from '../models/tenant/Product.js'
import { getTenantOrderModel } from '../models/tenant/Order.js'
import { getTenantReviewModel, getTenantThemeModel } from '../models/tenant/Review.js'

import bcrypt from 'bcryptjs'
import { assertSafeToSeed } from './seedGuard.js'
// Import seed dataset
import { SEED_TENANTS, SEED_APPLICATIONS, SEED_LUNAR_PRODUCTS } from './seedData.js'

export async function seedAllDatabases() {
  assertSafeToSeed()
  console.log('🌱 Starting Orvexa Tech Multi-Tenant Database Seeder...')

  // 1. Connect Master Database
  await connectMasterDatabase()
  console.log('✅ Connected to Master Database')

  const Tenant = getTenantModel(masterConnection)
  const Application = getApplicationModel(masterConnection)
  const AdminUser = getAdminUserModel(masterConnection)

  // Clear existing master data
  await Tenant.deleteMany({})
  await Application.deleteMany({})
  await AdminUser.deleteMany({})

  // Hash passwords for seeded tenants
  const seededTenantsWithPasswords = await Promise.all(
    SEED_TENANTS.map(async (t) => {
      const defaultPassword = `${t.slug}@password`
      const passwordHash = await bcrypt.hash(defaultPassword, 10)
      return {
        ...t,
        passwordHash,
      }
    })
  )

  // Seed Tenants
  await Tenant.insertMany(seededTenantsWithPasswords)
  console.log(`✅ Seeded ${SEED_TENANTS.length} tenants in Master Database (Passwords: <slug>@password)`)

  // Seed Applications
  await Application.insertMany(SEED_APPLICATIONS)
  console.log(`✅ Seeded ${SEED_APPLICATIONS.length} applications in Master Database`)

  // Seed Super Admin User
  const adminPasswordHash = await bcrypt.hash('admin@password', 10)
  await AdminUser.create({
    id: 'admin_master_001',
    name: 'Orvexa Tech Super Admin',
    email: 'admin@orvexatech.com',
    passwordHash: adminPasswordHash,
    role: 'super_admin',
  })
  console.log('✅ Seeded Super Admin User in Master Database (email: admin@orvexatech.com / pass: admin@password)')

  // 2. Seed Isolated Tenant Databases
  for (const tenant of SEED_TENANTS) {
    const tenantSlug = tenant.slug
    console.log(`📦 Seeding isolated database for tenant: ${tenant.brandName} (${tenantSlug})...`)
    const tenantConn = await getTenantConnection(tenantSlug)

    const Product = getTenantProductModel(tenantConn)
    const Order = getTenantOrderModel(tenantConn)
    const Review = getTenantReviewModel(tenantConn)
    const ThemeConfig = getTenantThemeModel(tenantConn)

    // Clear tenant tables
    await Product.deleteMany({})
    await Order.deleteMany({})
    await Review.deleteMany({})
    await ThemeConfig.deleteMany({})

    // Seed Products
    if (tenantSlug === 'lunar') {
      await Product.insertMany(SEED_LUNAR_PRODUCTS.map((p) => ({ stockCount: 50, ...p })))
      console.log(`   - Seeded ${SEED_LUNAR_PRODUCTS.length} products in ${tenantConn.name}`)
    }

    // Seed Theme
    await ThemeConfig.create(tenant.theme)
    console.log(`   - Seeded theme configuration in ${tenantConn.name}`)
  }

  console.log('🎉 Multi-Tenant Database Seeding Completed Successfully!')
}

// Execute if run directly
seedAllDatabases()
  .then(() => {
    console.log('Done.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seeding error:', err)
    process.exit(1)
  })
