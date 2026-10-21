import crypto from 'crypto'
import { atlasApiConfigured, atlasRequest, parseAtlasAccessList } from '../lib/atlas-digest.js'
import { sanitizeTenantSlug, tenantDatabaseName } from '../lib/tenant-db.js'

export { atlasApiConfigured }

export interface AtlasClusterResult {
  projectId: string
  clusterName: string
  databaseName: string
  mongoUri: string
}

interface AtlasErrorBody {
  detail?: string
  error?: string
  errorCode?: string
}

function atlasError(action: string, status: number, data: unknown): Error {
  const body = (data || {}) as AtlasErrorBody
  return new Error(`[Atlas] ${action} failed (${status}): ${body.detail || body.error || body.errorCode || 'unknown error'}`)
}

function projectName(slug: string): string {
  return `orvexa-${slug}`.slice(0, 64)
}

function clusterName(): string {
  return (process.env.ATLAS_TENANT_CLUSTER_NAME || 'orvexa').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'orvexa'
}

function tenantRegion(): string {
  return (process.env.ATLAS_TENANT_REGION || 'US_WEST_2').trim().toUpperCase()
}

function backingProvider(): string {
  return (process.env.ATLAS_TENANT_PROVIDER || 'AWS').trim().toUpperCase()
}

async function ensureProject(slug: string, env: NodeJS.ProcessEnv): Promise<string> {
  const orgId = env.ATLAS_ORG_ID?.trim() || ''
  const name = projectName(slug)
  const existing = await atlasRequest<{ id?: string } & AtlasErrorBody>('GET', `/groups/byName/${encodeURIComponent(name)}`, undefined, env)
  if (existing.status === 200 && existing.data.id) return existing.data.id
  if (existing.status !== 404 && existing.status !== 401) {
    // 401 on digest retry still means missing; 404 is the create path.
  }

  const created = await atlasRequest<{ id?: string } & AtlasErrorBody>('POST', '/groups', { name, orgId }, env)
  if (created.status === 201 || created.status === 200) {
    if (!created.data.id) throw new Error('[Atlas] Project created without an id.')
    return created.data.id
  }
  if ((created.status === 409 || created.status === 400) && /already exists/i.test(String(created.data.detail || ''))) {
    const again = await atlasRequest<{ id?: string }>('GET', `/groups/byName/${encodeURIComponent(name)}`, undefined, env)
    if (again.data.id) return again.data.id
  }
  throw atlasError(`create project ${name}`, created.status, created.data)
}

async function ensureCluster(projectId: string, env: NodeJS.ProcessEnv): Promise<string> {
  const name = clusterName()
  const got = await atlasRequest<{ name?: string; stateName?: string }>('GET', `/groups/${projectId}/clusters/${encodeURIComponent(name)}`, undefined, env)
  if (got.status === 200 && got.data.name) return name

  const created = await atlasRequest('POST', `/groups/${projectId}/clusters`, {
    name,
    clusterType: 'REPLICASET',
    replicationSpecs: [
      {
        regionConfigs: [
          {
            electableSpecs: { instanceSize: 'M0' },
            priority: 7,
            providerName: 'TENANT',
            backingProviderName: backingProvider(),
            regionName: tenantRegion(),
          },
        ],
      },
    ],
  }, env)
  if (created.status === 201 || created.status === 200 || created.status === 202) return name
  if (created.status === 409) return name
  throw atlasError(`create cluster ${name}`, created.status, created.data)
}

async function waitUntilIdle(projectId: string, name: string, env: NodeJS.ProcessEnv): Promise<string> {
  const deadline = Date.now() + Number(env.ATLAS_CLUSTER_WAIT_MS || 12 * 60 * 1000)
  while (Date.now() < deadline) {
    const got = await atlasRequest<{ stateName?: string; connectionStrings?: { standardSrv?: string } }>(
      'GET',
      `/groups/${projectId}/clusters/${encodeURIComponent(name)}`,
      undefined,
      env,
    )
    if (got.status === 200 && got.data.stateName === 'IDLE' && got.data.connectionStrings?.standardSrv) {
      return got.data.connectionStrings.standardSrv
    }
    if (got.status === 200 && /ERROR|DELETED/i.test(got.data.stateName || '')) {
      throw new Error(`[Atlas] Cluster ${name} entered ${got.data.stateName}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 20_000))
  }
  throw new Error(`[Atlas] Timed out waiting for cluster ${name} to become idle.`)
}

async function ensureAccessList(projectId: string, env: NodeJS.ProcessEnv): Promise<void> {
  const entries = parseAtlasAccessList(env.ATLAS_ACCESS_LIST || '')
  if (!entries.length) {
    throw new Error('ATLAS_ACCESS_LIST is required (comma-separated Render egress CIDRs). Do not use 0.0.0.0/0.')
  }
  const created = await atlasRequest(
    'POST',
    `/groups/${projectId}/accessList`,
    entries.map((cidrBlock) => ({ cidrBlock, comment: 'orvexa-tenant-render' })),
    env,
  )
  if (created.status === 201 || created.status === 200 || created.status === 409) return
  const detail = String((created.data as AtlasErrorBody).detail || '')
  if (created.status === 400 && /already present|duplicate/i.test(detail)) return
  throw atlasError('add network access list', created.status, created.data)
}

async function ensureDatabaseUser(projectId: string, slug: string, password: string, env: NodeJS.ProcessEnv): Promise<string> {
  const username = `orvexa_${slug}`.slice(0, 1024)
  const databaseName = tenantDatabaseName(slug)
  const body = {
    databaseName: 'admin',
    username,
    password,
    roles: [{ roleName: 'readWrite', databaseName }],
  }
  const created = await atlasRequest('POST', `/groups/${projectId}/databaseUsers`, body, env)
  if (created.status === 201 || created.status === 200) return username
  if (created.status === 409) {
    const patched = await atlasRequest(
      'PATCH',
      `/groups/${projectId}/databaseUsers/admin/${encodeURIComponent(username)}`,
      { password, roles: body.roles },
      env,
    )
    if (patched.status === 200 || patched.status === 201) return username
    throw atlasError(`rotate database user ${username}`, patched.status, patched.data)
  }
  throw atlasError(`create database user ${username}`, created.status, created.data)
}

function connectionUri(standardSrv: string, username: string, password: string, databaseName: string): string {
  const parsed = new URL(standardSrv.replace(/^mongodb\+srv:\/\//i, 'https://'))
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`
  return `mongodb+srv://${auth}@${parsed.host}/${databaseName}?retryWrites=true&w=majority`
}

/** Creates one Atlas project + M0 cluster + db-scoped user for a store. Blocks until the cluster is idle. */
export async function provisionDedicatedAtlasCluster(
  tenantSlug: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AtlasClusterResult> {
  if (!atlasApiConfigured(env)) {
    throw new Error('Set ATLAS_API_PUBLIC_KEY, ATLAS_API_PRIVATE_KEY, and ATLAS_ORG_ID to provision a dedicated Atlas cluster.')
  }
  const slug = sanitizeTenantSlug(tenantSlug)
  const databaseName = tenantDatabaseName(slug)
  const projectId = await ensureProject(slug, env)
  const name = await ensureCluster(projectId, env)
  await ensureAccessList(projectId, env)
  const standardSrv = await waitUntilIdle(projectId, name, env)
  const password = crypto.randomBytes(24).toString('base64url')
  const username = await ensureDatabaseUser(projectId, slug, password, env)
  return {
    projectId,
    clusterName: name,
    databaseName,
    mongoUri: connectionUri(standardSrv, username, password, databaseName),
  }
}
