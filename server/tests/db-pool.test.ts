import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mongoClusterHost,
  publicTenantIsolation,
  runningCommit,
  sanitizeTenantSlug,
  tenantDatabaseName,
  tenantDbPrefix,
  tenantIsolationMode,
  tenantSharesMasterCluster,
} from '../src/lib/tenant-db.js'

describe('tenant database naming (useDb pool)', () => {
  test('uses the path prefix from the tenant base URI plus a sanitized slug', () => {
    assert.equal(tenantDbPrefix('mongodb://localhost:27017/orvexa_tenant_'), 'orvexa_tenant_')
    assert.equal(
      tenantDatabaseName('lunar', 'mongodb+srv://u:p@cluster.mongodb.net/orvexa_tenant_'),
      'orvexa_tenant_lunar',
    )
    assert.equal(
      tenantDatabaseName('alpha', 'mongodb://127.0.0.1:27017/orvexa_test_tenant_'),
      'orvexa_test_tenant_alpha',
    )
  })

  test('rejects slugs that are not store addresses', () => {
    assert.throws(() => sanitizeTenantSlug('Admin'), /Invalid tenant slug/)
    assert.throws(() => sanitizeTenantSlug('../etc'), /Invalid tenant slug/)
    assert.throws(() => sanitizeTenantSlug('a'), /Invalid tenant slug/)
    assert.equal(sanitizeTenantSlug('Lunar'), 'lunar')
  })

  test('treats master and tenant URIs on the same host as one cluster (one pool)', () => {
    assert.equal(
      tenantSharesMasterCluster(
        'mongodb+srv://u:p@prod.abc.mongodb.net/orvexatech_master',
        'mongodb+srv://u:p@prod.abc.mongodb.net/orvexa_tenant_',
      ),
      true,
    )
    assert.equal(
      tenantSharesMasterCluster(
        'mongodb+srv://u:p@prod.abc.mongodb.net/orvexatech_master',
        'mongodb+srv://u:p@byodb.xyz.mongodb.net/orvexa_tenant_',
      ),
      false,
    )
    assert.equal(mongoClusterHost('mongodb://127.0.0.1:27017/orvexatech_master'), '127.0.0.1:27017')
  })

  test('public isolation facts never require a connection string', () => {
    assert.equal(tenantIsolationMode(''), 'dedicated_database')
    assert.equal(tenantIsolationMode('mongodb+srv://u:p@lunar.mongodb.net/orvexa_tenant_lunar'), 'dedicated_atlas_cluster')
    assert.deepEqual(publicTenantIsolation('lunar'), {
      databaseName: tenantDatabaseName('lunar'),
      isolationMode: 'dedicated_database',
      hasDedicatedCluster: false,
    })
    assert.equal(publicTenantIsolation('lunar', 'mongodb+srv://u:p@host/x').hasDedicatedCluster, true)
  })

  test('health commit prefers GIT_SHA, then Render, then Vercel', () => {
    assert.equal(runningCommit({ GIT_SHA: 'abc123' }), 'abc123')
    assert.equal(runningCommit({ RENDER_GIT_COMMIT: 'render1' }), 'render1')
    assert.equal(runningCommit({ VERCEL_GIT_COMMIT_SHA: 'vercel1' }), 'vercel1')
    assert.equal(runningCommit({}), 'unknown')
  })
})
