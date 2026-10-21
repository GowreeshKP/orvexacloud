import { closeTenantConnection, getTenantConnection } from '../config/db.js'
import { connectMasterDatabase } from '../config/db.js'
import { getTenantModel } from '../models/master/Tenant.js'
import { sanitizeTenantSlug, tenantDatabaseName } from '../lib/tenant-db.js'
import { atlasApiConfigured, provisionDedicatedAtlasCluster } from './atlasProvision.js'

const META_COLLECTION = '_orvexa_meta'

export async function initializeTenantDatabase(tenantSlug: string, customMongoUri?: string): Promise<{ databaseName: string }> {
  const slug = sanitizeTenantSlug(tenantSlug)
  const conn = await getTenantConnection(slug, customMongoUri)
  await conn.asPromise()
  const databaseName = conn.name || tenantDatabaseName(slug)
  await conn.db!.collection(META_COLLECTION).updateOne(
    { _id: 'isolation' } as any,
    {
      $set: {
        slug,
        databaseName,
        isolated: true,
        provisionedAt: new Date(),
      },
    },
    { upsert: true },
  )
  return { databaseName }
}

export async function copyTenantDatabase(sourceSlug: string, destUri: string): Promise<{ collections: number; documents: number }> {
  const slug = sanitizeTenantSlug(sourceSlug)
  const source = await getTenantConnection(slug)
  const dest = await getTenantConnection(`${slug}`, destUri)
  await source.asPromise()
  await dest.asPromise()
  if (!source.db || !dest.db) throw new Error('Tenant database handles are not ready.')

  const collections = await source.db.listCollections().toArray()
  let copiedCollections = 0
  let copiedDocuments = 0
  for (const col of collections) {
    if (!col.name || col.name.startsWith('system.')) continue
    const destCount = await dest.db.collection(col.name).countDocuments()
    if (destCount > 0 && col.name !== META_COLLECTION) continue
    const docs = await source.db.collection(col.name).find().toArray()
    if (!docs.length) continue
    if (destCount > 0) await dest.db.collection(col.name).deleteMany({})
    await dest.db.collection(col.name).insertMany(docs)
    copiedCollections += 1
    copiedDocuments += docs.length
  }
  return { collections: copiedCollections, documents: copiedDocuments }
}

export async function attachDedicatedCluster(
  tenantSlug: string,
  mongoUri: string,
  opts: { migrate?: boolean; projectId?: string } = {},
): Promise<{ databaseName: string; migrated?: { collections: number; documents: number } }> {
  const slug = sanitizeTenantSlug(tenantSlug)
  if (!mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Dedicated tenant clusters must use a mongodb+srv:// Atlas URI.')
  }

  let migrated: { collections: number; documents: number } | undefined
  if (opts.migrate) {
    migrated = await copyTenantDatabase(slug, mongoUri)
  }

  const { databaseName } = await initializeTenantDatabase(slug, mongoUri)
  const master = await connectMasterDatabase()
  await getTenantModel(master).updateOne(
    { slug },
    {
      $set: {
        customMongoUri: mongoUri,
        customDbName: databaseName,
        atlasProjectId: opts.projectId || '',
        atlasProvisionStatus: 'ready',
      },
    },
  )
  await closeTenantConnection(slug)
  return { databaseName, migrated }
}

export async function provisionTenantAtlasInBackground(tenantSlug: string, opts: { migrate?: boolean } = {}): Promise<void> {
  const slug = sanitizeTenantSlug(tenantSlug)
  if (!atlasApiConfigured()) return

  const master = await connectMasterDatabase()
  const Tenant = getTenantModel(master)
  await Tenant.updateOne({ slug }, { $set: { atlasProvisionStatus: 'creating' } })

  try {
    const cluster = await provisionDedicatedAtlasCluster(slug)
    await attachDedicatedCluster(slug, cluster.mongoUri, { migrate: opts.migrate !== false, projectId: cluster.projectId })
    console.log(`[Atlas] Dedicated cluster ready for ${slug} (db ${cluster.databaseName})`)
  } catch (err) {
    await Tenant.updateOne({ slug }, { $set: { atlasProvisionStatus: 'failed' } }).catch(() => undefined)
    console.error(`[Atlas] Dedicated cluster failed for ${slug}:`, err instanceof Error ? err.message : err)
  }
}
