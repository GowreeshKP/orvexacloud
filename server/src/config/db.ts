// --- Database Connection Manager ---
// One master Mongoose pool. Per-store databases are selected with useDb(name, { useCache: true })
// so each request does not open another TCP pool. Bring-your-own clusters still get their own connection.

import mongoose, { type Connection } from 'mongoose'
import dotenv from 'dotenv'
import dns from 'dns'
import {
  sanitizeTenantSlug,
  tenantDatabaseName,
  tenantSharesMasterCluster,
} from '../lib/tenant-db.js'

dotenv.config()

// Some local networks cannot resolve Atlas SRV records. Production keeps the platform resolver
// unless DNS_SERVERS (comma-separated) is set explicitly.
const dnsServers = process.env.DNS_SERVERS || (process.env.NODE_ENV === 'production' ? '' : '8.8.8.8,1.1.1.1')
if (dnsServers) {
  try {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean))
  } catch {
    // Ignore in environments where setServers is restricted
  }
}

if (process.env.NODE_ENV === 'production' && (!process.env.MONGODB_MASTER_URI || !process.env.MONGODB_TENANT_BASE_URI)) {
  throw new Error('MONGODB_MASTER_URI and MONGODB_TENANT_BASE_URI must be set in production (no localhost fallback).')
}
const MASTER_URI = process.env.MONGODB_MASTER_URI || 'mongodb://localhost:27017/orvexatech_master'
const TENANT_BASE_URI = process.env.MONGODB_TENANT_BASE_URI || 'mongodb://localhost:27017/orvexa_tenant_'

const POOL = {
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMS: 60000,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Master Database Connection
// ─────────────────────────────────────────────────────────────────────────────

let _masterConnection: Connection | null = null
let _masterPromise: Promise<Connection> | null = null

export let masterConnection: Connection

export async function connectMasterDatabase(): Promise<Connection> {
  if (_masterConnection && (_masterConnection.readyState === 1 || _masterConnection.readyState === 2)) {
    masterConnection = _masterConnection
    return _masterConnection
  }

  if (_masterPromise) {
    return _masterPromise
  }

  _masterPromise = (async () => {
    try {
      const conn = mongoose.createConnection(MASTER_URI, POOL)

      conn.on('connected', () => {
        console.log(`[Master DB] Connected`)
      })

      conn.on('error', (err) => {
        console.error(`[Master DB Error]`, err)
      })

      conn.on('disconnected', () => {
        _masterConnection = null
        _masterPromise = null
      })

      await conn.asPromise()

      _masterConnection = conn
      masterConnection = conn
      return conn
    } catch (error) {
      _masterPromise = null
      console.error(`Failed to connect to Master DB:`, error)
      throw error
    }
  })()

  return _masterPromise
}

connectMasterDatabase().catch((err) => {
  console.warn('[Master DB] Initial connection failed — will retry on next request:', err.message)
})

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Database Connections
// ─────────────────────────────────────────────────────────────────────────────

const useDbCache = new Map<string, Connection>()
const customConnectionPool = new Map<string, Connection>()

let _tenantBaseConnection: Connection | null = null
let _tenantBasePromise: Promise<Connection> | null = null

async function connectTenantBaseCluster(): Promise<Connection> {
  if (tenantSharesMasterCluster(MASTER_URI, TENANT_BASE_URI)) {
    return connectMasterDatabase()
  }

  if (_tenantBaseConnection && (_tenantBaseConnection.readyState === 1 || _tenantBaseConnection.readyState === 2)) {
    return _tenantBaseConnection
  }
  if (_tenantBasePromise) return _tenantBasePromise

  _tenantBasePromise = (async () => {
    const conn = mongoose.createConnection(TENANT_BASE_URI, POOL)
    conn.on('disconnected', () => {
      _tenantBaseConnection = null
      _tenantBasePromise = null
    })
    await conn.asPromise()
    _tenantBaseConnection = conn
    return conn
  })()

  return _tenantBasePromise
}

/**
 * Isolated database for one store.
 * Platform stores share the master (or tenant-base) pool via useDb('orvexa_tenant_<slug>', { useCache: true }).
 * A custom Mongo URI (BYODB) gets its own cached connection.
 */
export async function getTenantConnection(tenantSlug: string, customMongoUri?: string): Promise<Connection> {
  const slug = sanitizeTenantSlug(tenantSlug)

  if (customMongoUri?.trim()) {
    return getCustomTenantConnection(slug, customMongoUri.trim())
  }

  const dbName = tenantDatabaseName(slug, TENANT_BASE_URI)
  const existing = useDbCache.get(dbName)
  if (existing && (existing.readyState === 1 || existing.readyState === 2)) {
    return existing
  }

  const parent = await connectTenantBaseCluster()
  const tenantConn = parent.useDb(dbName, { useCache: true })
  useDbCache.set(dbName, tenantConn)
  return tenantConn
}

async function getCustomTenantConnection(slug: string, connectionUri: string): Promise<Connection> {
  const cacheKey = `custom_${slug}`
  const existing = customConnectionPool.get(cacheKey)
  if (existing && (existing.readyState === 1 || existing.readyState === 2)) {
    return existing
  }

  const hasDbPath = /^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/.test(connectionUri)

  try {
    const tenantConn = mongoose.createConnection(connectionUri, {
      ...(hasDbPath ? {} : { dbName: `orvexa_tenant_${slug}` }),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
    })

    tenantConn.on('connected', () => {
      console.log(`[Tenant DB: ${slug}] Connected (custom cluster)`)
    })

    tenantConn.on('error', (err) => {
      console.error(`[Tenant DB Error: ${slug}]`, err)
    })

    tenantConn.on('disconnected', () => {
      customConnectionPool.delete(cacheKey)
    })

    await tenantConn.asPromise()
    customConnectionPool.set(cacheKey, tenantConn)
    return tenantConn
  } catch (error) {
    console.error(`Failed to connect to Tenant DB (${slug}):`, error)
    throw error
  }
}

/**
 * Drop a cached tenant handle. useDb() connections must not be close()'d — that would
 * shut down the shared master pool.
 */
export async function closeTenantConnection(tenantSlug: string): Promise<void> {
  const slug = sanitizeTenantSlug(tenantSlug)
  useDbCache.delete(tenantDatabaseName(slug, TENANT_BASE_URI))
  const custom = customConnectionPool.get(`custom_${slug}`)
  if (custom) {
    await custom.close()
    customConnectionPool.delete(`custom_${slug}`)
  }
}
