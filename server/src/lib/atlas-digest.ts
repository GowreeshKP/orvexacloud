import crypto from 'crypto'

export const ATLAS_API_BASE = 'https://cloud.mongodb.com/api/atlas/v2'
export const ATLAS_ACCEPT = 'application/vnd.atlas.2023-02-01+json'

export function parseDigestChallenge(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  const prefix = header.replace(/^Digest\s+/i, '')
  const re = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(prefix))) {
    out[match[1]] = match[2] ?? match[3] ?? ''
  }
  return out
}

export function md5Hex(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex')
}

export function buildDigestAuthorization(opts: {
  username: string
  password: string
  method: string
  uri: string
  challenge: Record<string, string>
  nc?: string
  cnonce?: string
}): string {
  const nc = opts.nc || '00000001'
  const cnonce = opts.cnonce || crypto.randomBytes(8).toString('hex')
  const realm = opts.challenge.realm || ''
  const nonce = opts.challenge.nonce || ''
  const qop = opts.challenge.qop?.split(',')[0]?.trim() || 'auth'
  const algorithm = opts.challenge.algorithm || 'MD5'
  const ha1 = md5Hex(`${opts.username}:${realm}:${opts.password}`)
  const ha2 = md5Hex(`${opts.method.toUpperCase()}:${opts.uri}`)
  const response = md5Hex(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
  const parts = [
    `Digest username="${opts.username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${opts.uri}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
  ]
  if (opts.challenge.opaque) parts.push(`opaque="${opts.challenge.opaque}"`)
  return parts.join(', ')
}

export function atlasApiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ATLAS_API_PUBLIC_KEY?.trim() && env.ATLAS_API_PRIVATE_KEY?.trim() && env.ATLAS_ORG_ID?.trim())
}

export function parseAtlasAccessList(raw: string): string[] {
  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes('/') ? s : `${s}/32`))
  if (entries.some((e) => e === '0.0.0.0/0' || e === '::/0')) {
    throw new Error('ATLAS_ACCESS_LIST must not include 0.0.0.0/0')
  }
  return entries
}

export async function atlasRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ status: number; data: T }> {
  const publicKey = env.ATLAS_API_PUBLIC_KEY?.trim() || ''
  const privateKey = env.ATLAS_API_PRIVATE_KEY?.trim() || ''
  if (!publicKey || !privateKey) throw new Error('Atlas Admin API keys are not configured.')

  const url = path.startsWith('http') ? path : `${ATLAS_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const parsed = new URL(url)
  const digestUri = `${parsed.pathname}${parsed.search}`
  const headers: Record<string, string> = {
    Accept: ATLAS_ACCEPT,
    'Content-Type': 'application/json',
  }
  const payload = body === undefined ? undefined : JSON.stringify(body)

  const first = await fetch(url, { method, headers, body: payload })
  const challengeHeader = first.headers.get('www-authenticate') || ''
  if (first.status !== 401 || !/digest/i.test(challengeHeader)) {
    return { status: first.status, data: (await readJson(first)) as T }
  }

  const authorized = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: buildDigestAuthorization({
        username: publicKey,
        password: privateKey,
        method,
        uri: digestUri,
        challenge: parseDigestChallenge(challengeHeader),
      }),
    },
    body: payload,
  })
  return { status: authorized.status, data: (await readJson(authorized)) as T }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { detail: text }
  }
}
