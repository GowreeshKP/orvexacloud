#!/usr/bin/env node
// Creates the frontend folder for a store from src/tenants/_template/.
//   npm run store:create -- <slug> [--name "Brand Name"]
// Existing files are never overwritten, so it is safe to re-run on an existing store.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STORE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/
const TEXT_FILE = /\.(tsx?|css|md|json)$/

/**
 * @param {{ rootDir: string, slug: string, brandName?: string }} opts
 * @returns {{ folder: string, created: string[], skipped: string[] }}
 */
export function scaffoldStoreFolder({ rootDir, slug, brandName }) {
  const cleanSlug = String(slug || '').trim().toLowerCase()
  if (!STORE_SLUG_PATTERN.test(cleanSlug) || cleanSlug.startsWith('_')) {
    throw new Error(`Invalid store slug "${slug}". Use 3-30 lower-case letters, digits or hyphens.`)
  }
  const name = String(brandName || cleanSlug).replace(/[\r\n]+/g, ' ').replace(/\*\//g, '').trim() || cleanSlug

  const templateDir = path.join(rootDir, 'src', 'tenants', '_template')
  const targetDir = path.join(rootDir, 'src', 'tenants', cleanSlug)
  const created = []
  const skipped = []

  const copy = (from, to) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name)
      const dest = path.join(to, entry.name)
      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true })
        copy(src, dest)
        continue
      }
      const rel = path.relative(targetDir, dest).split(path.sep).join('/')
      if (fs.existsSync(dest)) {
        skipped.push(rel)
        continue
      }
      if (TEXT_FILE.test(entry.name)) {
        const text = fs
          .readFileSync(src, 'utf8')
          .replaceAll('__STORE_SLUG__', cleanSlug)
          .replaceAll('__STORE_NAME__', name)
        fs.writeFileSync(dest, text, 'utf8')
      } else {
        fs.copyFileSync(src, dest)
      }
      created.push(rel)
    }
  }

  fs.mkdirSync(targetDir, { recursive: true })
  copy(templateDir, targetDir)
  return { folder: path.relative(rootDir, targetDir).split(path.sep).join('/'), created, skipped }
}

function runCli() {
  const args = process.argv.slice(2)
  const nameIdx = args.indexOf('--name')
  const brandName = nameIdx >= 0 ? args[nameIdx + 1] : undefined
  const slug = args.find((a, i) => !a.startsWith('--') && i !== nameIdx + 1)
  if (!slug) {
    console.error('Usage: npm run store:create -- <slug> [--name "Brand Name"]')
    process.exit(1)
  }
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  try {
    const { folder, created, skipped } = scaffoldStoreFolder({ rootDir, slug, brandName })
    console.log(`Store folder: ${folder}/`)
    for (const f of created) console.log(`  + ${f}`)
    for (const f of skipped) console.log(`  = ${f} (already exists, left unchanged)`)
    if (created.length === 0) console.log('  Nothing to do: the folder is already complete.')
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
