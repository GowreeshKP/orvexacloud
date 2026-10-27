export const STORE_SLUG_PATTERN: RegExp

export function scaffoldStoreFolder(opts: { rootDir: string; slug: string; brandName?: string }): {
  folder: string
  created: string[]
  skipped: string[]
}
