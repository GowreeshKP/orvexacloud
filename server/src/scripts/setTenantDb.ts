// Points a store at its own MongoDB database.
// Usage (PowerShell):  $env:TENANT_MONGO_URI="mongodb+srv://..."; npm run tenant:set-db -- <slug>
// The URI is read from the environment so it never appears in shell history arguments or the repo.

import { connectMasterDatabase, getTenantConnection } from '../config/db.js'
import { getTenantModel } from '../models/master/Tenant.js'

async function main() {
  const slug = (process.argv[2] || '').trim().toLowerCase()
  const uri = (process.env.TENANT_MONGO_URI || '').trim()

  if (!slug) throw new Error('Pass the store slug, e.g. npm run tenant:set-db -- lunar')
  if (!uri.startsWith('mongodb+srv://')) throw new Error('TENANT_MONGO_URI must be a mongodb+srv:// connection string.')

  const master = await connectMasterDatabase()
  const Tenant = getTenantModel(master)
  const tenant = await Tenant.findOne({ slug })
  if (!tenant) throw new Error(`No store with slug "${slug}" in the master database.`)

  const conn = await getTenantConnection(slug, uri)
  await conn.asPromise()
  await conn.db!.command({ ping: 1 })
  console.log(`[set-db] Connected to database "${conn.name}" for ${slug}.`)

  await Tenant.updateOne({ slug }, { $set: { customMongoUri: uri } })
  console.log(`[set-db] ${slug} now uses its own database.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[set-db] Failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
