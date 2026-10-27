// --- Request input validation helpers ---
// Every value read from req.body / req.query / req.params is untrusted. Express's query parser
// turns `?a[$ne]=1` into objects, so string fields must be type-checked before reaching Mongo.

export class ValidationError extends Error {
  status = 400
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/
export const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Returns a trimmed string, or `undefined` when absent. Rejects non-strings and over-long values. */
export function optString(v: unknown, field: string, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new ValidationError(`${field} must be text.`)
  const s = v.trim()
  if (s.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`)
  return s
}

export function reqString(v: unknown, field: string, max = 500, min = 1): string {
  const s = optString(v, field, max)
  if (s === undefined || s.length < min) throw new ValidationError(`${field} is required.`)
  return s
}

export function optNumber(v: unknown, field: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number.`)
  if (opts.integer && !Number.isInteger(n)) throw new ValidationError(`${field} must be a whole number.`)
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(`${field} must be at least ${opts.min}.`)
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(`${field} must be at most ${opts.max}.`)
  return n
}

export function reqNumber(v: unknown, field: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number {
  const n = optNumber(v, field, opts)
  if (n === undefined) throw new ValidationError(`${field} is required.`)
  return n
}

export function optBoolean(v: unknown, field: string): boolean | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'boolean') throw new ValidationError(`${field} must be true or false.`)
  return v
}

export function optStringArray(v: unknown, field: string, maxItems = 50, maxLen = 500): string[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v) || v.length > maxItems) throw new ValidationError(`${field} must be a list of at most ${maxItems} items.`)
  return v.map((item, i) => reqString(item, `${field}[${i}]`, maxLen))
}

// Images are either remote URLs or inline data URLs produced by the dashboard's image picker.
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/
export const MAX_INLINE_IMAGE_CHARS = 1_500_000 // ~1.1 MB decoded

export function optImageUrl(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === '') return v === '' ? '' : undefined
  if (typeof v !== 'string') throw new ValidationError(`${field} must be an image URL.`)
  const s = v.trim()
  if (s.startsWith('data:')) {
    if (s.length > MAX_INLINE_IMAGE_CHARS) throw new ValidationError(`${field} is too large (max ~1 MB). Use a smaller image.`)
    if (!IMAGE_DATA_URL.test(s)) throw new ValidationError(`${field} must be a PNG, JPEG, WebP, GIF or AVIF image.`)
    return s
  }
  if (s.length > 2048) throw new ValidationError(`${field} URL is too long.`)
  let url: URL
  try {
    url = new URL(s)
  } catch {
    throw new ValidationError(`${field} must be a valid image URL.`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ValidationError(`${field} must use http or https.`)
  return s
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Reads a single string query value; arrays/objects (from `?x[]=` or `?x[$ne]=`) are ignored. */
export function queryString(v: unknown, max = 100): string | undefined {
  return typeof v === 'string' && v.length <= max ? v : undefined
}

export function pagination(query: Record<string, unknown>, defaultLimit = 50, maxLimit = 200): { limit: number; page: number; skip: number } {
  const limit = Math.min(Math.max(parseInt(queryString(query.limit) || '', 10) || defaultLimit, 1), maxLimit)
  const page = Math.max(parseInt(queryString(query.page) || '', 10) || 1, 1)
  return { limit, page, skip: (page - 1) * limit }
}

export function normalizePhone(v: string): string {
  return v.replace(/\D/g, '').slice(-10)
}
