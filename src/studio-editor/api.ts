import type { Check, GenerateBrief, RewriteStyle, Theme } from '@orvexa/theme'
import { API_BASE } from '@/api/base'
import { authService } from '@/api/auth'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message)
  }
}

export type StockPhoto = {
  id: number
  alt: string
  width: number
  height: number
  preview: string
  photographer: string
  photographerUrl: string
  pageUrl: string
}

export type VersionSummary = {
  id: string
  version: number
  note: string
  createdBy: string
  createdAt: string
}

type DraftRecord = { theme: Theme; revision: number }
type VersionRecord = VersionSummary & { theme: Theme }

function draftKey(slug: string) {
  return `oxs:draft:${slug}`
}
function versionsKey(slug: string) {
  return `oxs:versions:${slug}`
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await authService.getStoreAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function putTheme(slug: string, updates: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/theme`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new ApiError(
      typeof body.error === 'string' ? body.error : 'Could not save storefront.',
      res.status,
      body,
    )
  }
  return body
}

function readDraft(slug: string): DraftRecord | null {
  try {
    const raw = localStorage.getItem(draftKey(slug))
    if (!raw) return null
    return JSON.parse(raw) as DraftRecord
  } catch {
    return null
  }
}

function writeDraft(slug: string, record: DraftRecord) {
  localStorage.setItem(draftKey(slug), JSON.stringify(record))
}

function readVersions(slug: string): VersionRecord[] {
  try {
    const raw = localStorage.getItem(versionsKey(slug))
    if (!raw) return []
    return JSON.parse(raw) as VersionRecord[]
  } catch {
    return []
  }
}

function writeVersions(slug: string, versions: VersionRecord[]) {
  localStorage.setItem(versionsKey(slug), JSON.stringify(versions.slice(0, 30)))
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 900_000) {
      reject(new Error('Photo is too large (max ~900 KB). Compress it and try again.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that photo.'))
    reader.readAsDataURL(file)
  })
}

/** Orvexa-cloud-backed studio API — no separate STUDIO_URL / launch secrets. */
export function createStudioApi(slug: string) {
  return {
    saveDraft: async (theme: Theme, baseRevision: number | null) => {
      const current = readDraft(slug)
      if (baseRevision != null && current && current.revision !== baseRevision) {
        throw new ApiError('Changed in another window', 409, {})
      }
      const revision = (baseRevision ?? current?.revision ?? 0) + 1
      writeDraft(slug, { theme, revision })
      await putTheme(slug, {
        studioDraft: theme,
        studioDraftRevision: revision,
      })
      return { revision }
    },

    publish: async (revision: number, note: string) => {
      const draft = readDraft(slug)
      if (!draft || draft.revision !== revision) {
        throw new ApiError('Save your draft before publishing.', 400, {})
      }
      const versions = readVersions(slug)
      const version = (versions[0]?.version || 0) + 1
      const summary: VersionSummary = {
        id: `v_${version}_${Date.now()}`,
        version,
        note: note.slice(0, 200),
        createdBy: 'owner',
        createdAt: new Date().toISOString(),
      }
      writeVersions(slug, [{ ...summary, theme: draft.theme }, ...versions])
      await putTheme(slug, {
        studioDraft: draft.theme,
        studioDraftRevision: draft.revision,
        studioPublished: draft.theme,
        studioPublishedVersion: version,
        studioPublishedAt: summary.createdAt,
        studioPublishedNote: summary.note,
      })
      // Flip live flag on the tenant via theme mirror fields the API already accepts as Mixed.
      await putTheme(slug, {
        storefrontStudioEnabled: true,
      }).catch(() => undefined)
      // Best-effort: also hit a lightweight owner profile-style update if theme rejects unknown keys.
      try {
        const token = await authService.getStoreAccessToken()
        await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/studio-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            theme: draft.theme,
            version,
            note: summary.note,
            publishedAt: summary.createdAt,
          }),
        })
      } catch {
        /* studio-publish route may not exist yet — Mixed theme fields still hold the document */
      }
      return { version: summary, notified: true }
    },

    versions: async () => ({
      versions: readVersions(slug).map(({ id, version, note, createdBy, createdAt }) => ({
        id,
        version,
        note,
        createdBy,
        createdAt,
      })),
    }),

    restore: async (id: string, baseRevision: number | null) => {
      const hit = readVersions(slug).find((v) => v.id === id)
      if (!hit) throw new ApiError('Version not found.', 404, {})
      const revision = (baseRevision ?? readDraft(slug)?.revision ?? 0) + 1
      writeDraft(slug, { theme: hit.theme, revision })
      await putTheme(slug, { studioDraft: hit.theme, studioDraftRevision: revision })
      return { theme: hit.theme, revision }
    },

    upload: async (file: File) => ({ url: await fileToDataUrl(file) }),

    generate: async (_brief: Partial<GenerateBrief>) => {
      throw new ApiError('Magic AI is not enabled in the dashboard editor yet.', 501, {})
    },
    rewrite: async (_input: {
      text: string
      style: RewriteStyle
      fieldLabel: string
      maxLength: number
      brandName: string
      nicheId: string
      context?: string
    }): Promise<{ text: string }> => {
      throw new ApiError('Magic AI rewrite is not enabled in the dashboard editor yet.', 501, {})
    },
    stockSearch: async (_q: string, _orientation?: string) => ({ photos: [] as StockPhoto[] }),
    stockImport: async (_id: number): Promise<{ url: string; alt: string; credit: string }> => {
      throw new ApiError('Stock photos are not enabled in the dashboard editor yet.', 501, {})
    },
    seo: async (_theme: Theme) => ({ title: '', description: '' }),
  }
}

export type StudioApi = ReturnType<typeof createStudioApi>

/** Mutable module pointer so Studio.tsx / Dialogs can keep importing `{ api }`. */
export let api: StudioApi = createStudioApi('_unset_')

export function bindStudioApi(slug: string) {
  api = createStudioApi(slug)
  return api
}

export type PublishBlocked = { checks: Check[] }
