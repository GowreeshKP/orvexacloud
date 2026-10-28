// Demo-only store owner login links. Production links are random keys stored on the tenant
// and returned only to an Orvexa admin. These presets stay fixed so a demo URL does not
// change when the store record is edited.

const STORAGE_KEY = 'orvexa_owner_login_links_v1'

const PRESET_KEYS: Record<string, string> = {
  lunar: 'Lk7lunarOwnerLoginKey9Qm2',
  silkhaus: 'Sk4silkHausOwnerLogin8Wn1',
  khadistudio: 'Kh3khadiOwnerLoginKey5Rp8',
  bloomweave: 'Bw8bloomOwnerLoginKey2Yt6',
}

export interface OwnerLoginLink {
  slug: string
  key: string
  revoked: boolean
}

type Stored = Record<string, { key: string; revoked: boolean }>

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Stored
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function write(map: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage can be unavailable in private mode.
  }
}

function randomKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function ownerLoginPath(key: string): string {
  return `/owner/${key}`
}

export function absoluteOwnerLoginUrl(key: string): string {
  if (typeof window === 'undefined') return ownerLoginPath(key)
  return `${window.location.origin}${ownerLoginPath(key)}`
}

export function demoOwnerLogin(slug: string): OwnerLoginLink {
  const clean = slug.trim().toLowerCase()
  const stored = read()[clean]
  if (stored?.key) return { slug: clean, key: stored.key, revoked: Boolean(stored.revoked) }
  const preset = PRESET_KEYS[clean]
  if (preset) return { slug: clean, key: preset, revoked: false }
  const created = { key: randomKey(), revoked: false }
  const map = read()
  map[clean] = created
  write(map)
  return { slug: clean, key: created.key, revoked: false }
}

export function lookupDemoOwnerLogin(key: string): OwnerLoginLink | null {
  const map = read()
  const stored = Object.entries(map).find(([, value]) => value.key === key)
  if (stored) return { slug: stored[0], key, revoked: Boolean(stored[1].revoked) }
  const preset = Object.entries(PRESET_KEYS).find(([, value]) => value === key)
  if (!preset || map[preset[0]]) return null
  return { slug: preset[0], key, revoked: false }
}

export function updateDemoOwnerLogin(slug: string, action: 'rotate' | 'revoke' | 'restore'): OwnerLoginLink {
  const current = demoOwnerLogin(slug)
  const map = read()
  if (action === 'rotate') {
    const next = { key: randomKey(), revoked: false }
    map[current.slug] = next
    write(map)
    return { slug: current.slug, ...next }
  }
  const revoked = action === 'revoke'
  map[current.slug] = { key: current.key, revoked }
  write(map)
  return { slug: current.slug, key: current.key, revoked }
}
