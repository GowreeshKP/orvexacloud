// Creates a dedicated Atlas project+cluster for one store and points the tenant at it.
// Usage: npm run tenant:provision-atlas -- lunar
// Requires ATLAS_API_PUBLIC_KEY, ATLAS_API_PRIVATE_KEY, ATLAS_ORG_ID, ATLAS_ACCESS_LIST.
// To attach a cluster you already created: set TENANT_MONGO_URI and run tenant:set-db.

import { atlasApiConfigured, provisionDedicatedAtlasCluster } from '../services/atlasProvision.js'
import { attachDedicatedCluster } from '../services/tenantIsolation.js'
import { connectMasterDatabase } from '../config/db.js'
import { getTenantModel } from '../models/master/Tenant.js'

async function main() {
  const slug = (process.argv[2] || '').trim().toLowerCase()
  if (!slug) throw new Error('Pass the store slug, e.g. npm run tenant:provision-atlas -- lunar')

  const master = await connectMasterDatabase()
  const tenant = await getTenantModel(master).findOne({ slug })
  if (!tenant) throw new Error(`No store with slug "${slug}" in the master database.`)

  if (tenant.customMongoUri) {
    console.log(`[atlas] ${slug} already has a dedicated cluster (db ${tenant.customDbName || `orvexa_tenant_${slug}`}).`)
    return
  }

  if (!atlasApiConfigured()) {
    throw new Error(
      'Atlas Admin API is not configured. Set ATLAS_API_PUBLIC_KEY, ATLAS_API_PRIVATE_KEY, ATLAS_ORG_ID, and ATLAS_ACCESS_LIST, or create the cluster in Atlas and run tenant:set-db.',
    )
  }

  const cluster = await provisionDedicatedAtlasCluster(slug)
  const attached = await attachDedicatedCluster(slug, cluster.mongoUri, { migrate: true, projectId: cluster.projectId })
  console.log(`[atlas] ${slug} now uses dedicated database ${attached.databaseName}.`)
  if (attached.migrated) {
    console.log(`[atlas] Migrated ${attached.migrated.documents} documents in ${attached.migrated.collections} collections.`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[atlas] Failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
