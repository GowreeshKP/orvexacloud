// Copies the storefront stylesheet into public/ so the Grapes canvas can load /storefront.css.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'packages/storefront-ui/src/storefront.css')
const destDir = join(root, 'public')
mkdirSync(destDir, { recursive: true })
copyFileSync(src, join(destDir, 'storefront.css'))
console.log('Copied storefront.css for the editor canvas.')
