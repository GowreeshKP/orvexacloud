// --- Tenant Provisioner Service ---
// Generates credentials and database config for newly approved store clients.
// On Vercel (read-only FS), filesystem scaffolding is skipped — all data goes to MongoDB.
// Locally, it also writes tenant folders and .env files for developer convenience.

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { PLAN_CATALOG, PLATFORM_ROOT_DOMAIN, TRIAL_DAYS, type PlanId } from '../config/plans.js'
import { atlasApiConfigured } from './atlasProvision.js'
import { initializeTenantDatabase, provisionTenantAtlasInBackground } from './tenantIsolation.js'
import { tenantIsolationMode } from '../lib/tenant-db.js'

// Filesystem scaffolding is a local-development convenience only; production keeps everything in MongoDB.
const isVercel = Boolean(process.env.VERCEL)
const skipScaffolding = isVercel || process.env.NODE_ENV === 'production' || process.env.TENANT_SCAFFOLDING === 'off'

/** Hides the user:password part of a MongoDB URI. */
function redactUri(uri: string): string {
  return uri.replace(/\/\/[^@/]+@/, '//***:***@')
}

export interface ProvisionTenantInput {
  slug: string
  brandName: string
  ownerName: string
  ownerEmail: string
  ownerPhone?: string
  customMongoUri?: string
  customDomain?: string
  description?: string
  primaryColor?: string
  accentColor?: string
  initialPassword?: string // plain-text; will be bcrypt-hashed before storage
  plan?: PlanId
}

export interface ProvisionResult {
  success: boolean
  folderPath: string
  envFilePath: string
  dbName: string
  mongoUri: string
  passwordHash: string
  message: string
  isolationMode: 'dedicated_atlas_cluster' | 'dedicated_database'
  atlasProvisionStarted: boolean
}

export async function provisionTenantFolders(input: ProvisionTenantInput): Promise<ProvisionResult> {
  const slug = input.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '')
  const dbName = `orvexa_tenant_${slug}`
  const tenantBaseUri = process.env.MONGODB_TENANT_BASE_URI || 'mongodb://localhost:27017/orvexa_tenant_'
  const mongoUri = input.customMongoUri?.trim() || `${tenantBaseUri}${slug}`
  const primaryColor = input.primaryColor || '#8C5A4F'
  const accentColor = input.accentColor || '#D4A574'
  const plan = input.plan || 'starter'
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Without an explicit initial password the owner sets one through the emailed link.
  const rawPassword = input.initialPassword || crypto.randomBytes(24).toString('base64url')
  const passwordHash = await bcrypt.hash(rawPassword, 12)
  const q = (s: string) => JSON.stringify(s)

  const srcEnvPath = `src/tenants/${slug}/tenant.env`

  // ── Filesystem scaffolding — local development only ─────────────────────
  // Vercel's runtime has a read-only filesystem, so we skip this entirely.
  // All tenant configuration is stored in MongoDB (master DB Tenant document).
  if (!skipScaffolding) {
    try {
      // Lazy-import fs/path only when actually needed (keeps the serverless bundle clean)
      const fs = await import('fs')
      const path = await import('path')
      const { fileURLToPath, pathToFileURL } = await import('url')

      const __filename = fileURLToPath(import.meta.url)
      const __dirname = path.dirname(__filename)

      const rootDir = path.resolve(__dirname, '../../../')
      const srcTenantsDir = path.join(rootDir, 'src', 'tenants', slug)
      const serverTenantsDir = path.join(rootDir, 'server', 'src', 'tenants', slug)

      if (!fs.existsSync(srcTenantsDir)) fs.mkdirSync(srcTenantsDir, { recursive: true })
      if (!fs.existsSync(serverTenantsDir)) fs.mkdirSync(serverTenantsDir, { recursive: true })

      const envContent = `# --- Tenant Environment Variables ---
# Store: ${input.brandName}
# Platform: Orvexa Tech Multi-Tenant Ecosystem
# Provisioned: ${new Date().toISOString()}

TENANT_ID=tenant_${slug}_${Date.now()}
TENANT_SLUG=${slug}
BRAND_NAME=${q(input.brandName)}
SUBDOMAIN=${slug}.${PLATFORM_ROOT_DOMAIN}
CUSTOM_DOMAIN=${q(input.customDomain || '')}
PRIMARY_COLOR="${primaryColor}"
ACCENT_COLOR="${accentColor}"

# --- Isolated Database Configuration ---
# Credentials are never written here; the server builds the URI from MONGODB_TENANT_BASE_URI.
MONGODB_DB_NAME=${dbName}
MONGODB_URI_REDACTED=${redactUri(mongoUri)}
MONGODB_ISOLATION_MODE=dedicated_database
ENABLE_ORDER_TRACKING=true
ENABLE_CUSTOMER_REVIEWS=true
`
      const camel = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
      const configTsContent = `import type { TenantConfig } from '@/types/tenant'

export const ${camel}TenantConfig: TenantConfig = {
  id: ${q(`tenant_${slug}_${Date.now()}`)},
  slug: ${q(slug)},
  brandName: ${q(input.brandName)},
  ownerName: ${q(input.ownerName || '')},
  ownerEmail: ${q(input.ownerEmail)},
  ownerPhone: ${q(input.ownerPhone || '')},
  logo: '',
  status: 'active',
  plan: '${plan}',
  createdAt: '${new Date().toISOString().split('T')[0]}',
  theme: {
    primaryColor: '${primaryColor}',
    accentColor: '${accentColor}',
    backgroundColor: '#FAFAF8',
    fontDisplay: "'Instrument Serif', Georgia, serif",
    fontSans: "'Work Sans', system-ui, sans-serif",
    heroImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&q=80',
    heroHeadline: ${q(`${input.brandName} Atelier`)},
    heroSubhead: ${q(input.description || `Handcrafted exclusive collection from ${input.brandName}`)},
    heroCtaText: 'EXPLORE CATALOG →',
    logoUrl: '',
    announcementMessages: [
      ${q(`WELCOME TO ${input.brandName.toUpperCase()}`)},
      'FREE SHIPPING OVER ₹999',
    ],
    enableAnimations: true,
    enableReviews: true,
    enableOrderTracking: true,
  },
  subscription: {
    plan: '${plan}',
    pricePerMonth: ${PLAN_CATALOG[plan].pricePerMonth},
    status: 'trial',
    trialEndsAt: '${trialEnds}',
    nextBillingDate: '${trialEnds}',
    paymentMethod: 'razorpay',
    invoices: [],
  },
  databaseConfig: {
    dbName: '${dbName}',
    mongoUri: ${q(redactUri(mongoUri))},
    isolationMode: 'dedicated_database',
    folderPath: 'src/tenants/${slug}',
  },
}
`
      const absEnvPath = path.join(srcTenantsDir, 'tenant.env')
      const serverEnvPath = path.join(serverTenantsDir, 'tenant.env')
      fs.writeFileSync(absEnvPath, envContent, 'utf-8')
      fs.writeFileSync(serverEnvPath, envContent, 'utf-8')
      fs.writeFileSync(path.join(srcTenantsDir, 'config.ts'), configTsContent, 'utf-8')
      fs.writeFileSync(path.join(srcTenantsDir, 'index.ts'), `export * from './config'\n`, 'utf-8')

      // Loaded at runtime because the script lives outside the server's TypeScript project.
      const scaffoldScript = path.join(rootDir, 'scripts', 'create-store.mjs')
      if (fs.existsSync(scaffoldScript)) {
        const { scaffoldStoreFolder } = await import(pathToFileURL(scaffoldScript).href)
        scaffoldStoreFolder({ rootDir, slug, brandName: input.brandName })
      }

      console.log(`[Provisioner] Scaffolded local tenant folder: src/tenants/${slug}`)
    } catch (fsErr) {
      console.warn('[Provisioner] Filesystem scaffolding failed (non-fatal):', fsErr)
    }
  }

  try {
    await initializeTenantDatabase(slug, input.customMongoUri)
  } catch (dbErr) {
    console.warn('[Provisioner] Isolated tenant database init failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr)
  }

  const atlasProvisionStarted = !input.customMongoUri?.trim() && atlasApiConfigured()
  if (atlasProvisionStarted) {
    void provisionTenantAtlasInBackground(slug, { migrate: true })
  }

  return {
    success: true,
    folderPath: `src/tenants/${slug}`,
    envFilePath: srcEnvPath,
    dbName,
    mongoUri: redactUri(mongoUri),
    passwordHash,
    isolationMode: tenantIsolationMode(input.customMongoUri),
    atlasProvisionStarted,
    message: isVercel
      ? `Provisioned isolated database and credentials for ${input.brandName} (MongoDB only on Vercel)`
      : `Provisioned separate folder & isolated database for ${input.brandName} at src/tenants/${slug}`,
  }
}
