// --- Database Connection Manager ---
// Implements Multi-Tenant Isolated Database Architecture using Mongoose Connections.
// Uses module-level caching so connections survive across warm serverless invocations.

import mongoose, { type Connection } from 'mongoose'
import dotenv from 'dotenv'
import dns from 'dns'

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

const MASTER_URI = process.env.MONGODB_MASTER_URI || 'mongodb://localhost:27017/orvexatech_master'
const TENANT_BASE_URI = process.env.MONGODB_TENANT_BASE_URI || 'mongodb://localhost:27017/orvexa_tenant_'

// ─────────────────────────────────────────────────────────────────────────────
// Master Database Connection
// ─────────────────────────────────────────────────────────────────────────────

// Module-level cache — persists across warm serverless invocations
let _masterConnection: Connection | null = null
let _masterPromise: Promise<Connection> | null = null

export let masterConnection: Connection

export async function connectMasterDatabase(): Promise<Connection> {
  // Return cached connection if alive
  if (_masterConnection && (_masterConnection.readyState === 1 || _masterConnection.readyState === 2)) {
    masterConnection = _masterConnection
    return _masterConnection
  }

  if (_masterPromise) {
    return _masterPromise
  }

  _masterPromise = (async () => {
    try {
      const conn = mongoose.createConnection(MASTER_URI, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 60000,
      })

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

// Initialise eagerly on module load
connectMasterDatabase().catch((err) => {
  console.warn('[Master DB] Initial connection failed — will retry on next request:', err.message)
})

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Database Connections
// ─────────────────────────────────────────────────────────────────────────────

// Map of active cached tenant connections: slug → Connection
const tenantConnectionPool = new Map<string, Connection>()

/**
 * Get or create an isolated MongoDB connection for a specific tenant store.
 * Supports Bring-Your-Own-Database (custom Mongo URI) or platform multi-db provisioning.
 */
export async function getTenantConnection(tenantSlug: string, customMongoUri?: string): Promise<Connection> {
  const cacheKey = customMongoUri ? `custom_${tenantSlug}` : tenantSlug

  const existing = tenantConnectionPool.get(cacheKey)
  if (existing && (existing.readyState === 1 || existing.readyState === 2)) {
    return existing
  }

  const connectionUri = customMongoUri?.trim() || `${TENANT_BASE_URI}${tenantSlug}`
  // Atlas URIs often omit the database path, which would otherwise land data in "test".
  const hasDbPath = /^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/.test(connectionUri)

  try {
    const tenantConn = mongoose.createConnection(connectionUri, {
      ...(hasDbPath ? {} : { dbName: `orvexa_tenant_${tenantSlug}` }),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
    })

    tenantConn.on('connected', () => {
      console.log(`[Tenant DB: ${tenantSlug}] Connected`)
    })

    tenantConn.on('error', (err) => {
      console.error(`[Tenant DB Error: ${tenantSlug}]`, err)
    })

    tenantConn.on('disconnected', () => {
      tenantConnectionPool.delete(cacheKey)
    })

    await tenantConn.asPromise()

    tenantConnectionPool.set(cacheKey, tenantConn)
    return tenantConn
  } catch (error) {
    console.error(`Failed to connect to Tenant DB (${tenantSlug}):`, error)
    throw error
  }
}

/**
 * Close and remove a tenant connection from pool (e.g. when swapping custom URI).
 */
export async function closeTenantConnection(tenantSlug: string): Promise<void> {
  for (const [key, conn] of tenantConnectionPool.entries()) {
    if (key === tenantSlug || key === `custom_${tenantSlug}`) {
      await conn.close()
      tenantConnectionPool.delete(key)
    }
  }
}
