import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'Orvexa-Login-Credentials.pdf')

function escapePdf(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function pageStream(draw) {
  const lines = ['BT', ...draw, 'ET']
  return Buffer.from(lines.join('\n'), 'latin1')
}

function text(x, y, size, str, font = 'F1') {
  return [`/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${escapePdf(str)}) Tj`]
}

function wrap(str, width) {
  const words = String(str).split(/\s+/)
  const rows = []
  let row = ''
  for (const word of words) {
    const next = row ? `${row} ${word}` : word
    if (next.length > width) {
      if (row) rows.push(row)
      row = word
    } else {
      row = next
    }
  }
  if (row) rows.push(row)
  return rows
}

function table(x, y, cols, rows, colW) {
  const out = []
  let cy = y
  const header = rows[0]
  out.push(...text(x, cy, 9, header.map((c, i) => String(c).padEnd(colW[i])).join(' '), 'F2'))
  cy -= 12
  out.push(...text(x, cy, 8, '-'.repeat(86)))
  cy -= 14
  for (const row of rows.slice(1)) {
    const wrapped = cols.map((_, i) => wrap(row[i], colW[i]))
    const h = Math.max(...wrapped.map((w) => w.length), 1)
    for (let line = 0; line < h; line++) {
      const parts = cols.map((_, i) => (wrapped[i][line] || '').padEnd(colW[i]))
      out.push(...text(x, cy, 8, parts.join(' ')))
      cy -= 11
    }
    cy -= 4
  }
  return { ops: out, y: cy }
}

const pages = []

pages.push(() => {
  const ops = []
  ops.push(...text(56, 760, 22, 'Orvexa Cloud', 'F2'))
  ops.push(...text(56, 732, 28, 'Login Credentials', 'F2'))
  ops.push(...text(56, 708, 11, 'Demo, seed, and local accounts from the product source'))
  ops.push(...text(56, 680, 9, '16 October 2026  ·  v1.0  ·  Orvexa Tech Private Limited'))
  let y = 640
  for (const line of wrap(
    'This sheet lists every login ID and password that ships in the Orvexa Cloud codebase. Use it for local Vite and for a database that was filled with npm run seed. It does not contain Render, Atlas, Cloudflare, or GitHub secrets.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 10
  ops.push(...text(56, y, 11, 'Live production warning', 'F2'))
  y -= 16
  for (const line of wrap(
    'The free-plan API at orvexa-api-nskw.onrender.com was not seeded. These demo passwords were tested against that API and were rejected. Production admin and seller passwords live in Mongo on Atlas. They are not in git and are not printed here.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 18
  ops.push(...text(56, y, 13, '1. Where to sign in', 'F2'))
  y -= 22
  const t = table(
    56,
    y,
    ['Surface', 'Live URL', 'Local'],
    [
      ['Surface', 'Live URL', 'Local'],
      ['Admin portal', 'https://orvexa-cloud.pages.dev/', 'http://localhost:8443/admin'],
      ['Seller (Lunar)', 'https://orvexa-cloud.pages.dev/t/lunar/dashboard', 'http://localhost:8443/t/lunar/dashboard'],
      ['Storefront (Lunar)', 'https://orvexa-cloud.pages.dev/t/lunar', 'http://localhost:8443/t/lunar'],
      ['API health', 'https://orvexa-api-nskw.onrender.com/api/health', 'http://localhost:5000/api/health'],
    ],
    [18, 48, 28],
  )
  ops.push(...t.ops)
  y = t.y - 8
  for (const line of wrap(
    'On pages.dev use /admin, /t/<slug>, and /t/<slug>/dashboard. Do not use orvexacloud.in for this stack — that host is an older site. api.orvexacloud.in and admin.orvexacloud.in have no DNS.',
    92,
  )) {
    ops.push(...text(56, y, 9, line))
    y -= 12
  }
  return ops
})

pages.push(() => {
  const ops = []
  ops.push(...text(56, 780, 16, '2. Super Admin', 'F2'))
  let y = 754
  const admin = table(
    56,
    y,
    ['Field', 'Value'],
    [
      ['Field', 'Value'],
      ['Name', 'Orvexa Tech Super Admin'],
      ['Login ID / email', 'admin@orvexatech.com'],
      ['Demo aliases', 'admin@platform.com or admin'],
      ['Password', 'admin@password'],
      ['Role', 'super_admin'],
      ['Works on live Render?', 'No — live API returned invalid credentials'],
    ],
    [28, 62],
  )
  ops.push(...admin.ops)
  y = admin.y - 12
  ops.push(...text(56, y, 12, 'Production admin', 'F2'))
  y -= 16
  for (const line of wrap(
    'Render generated ADMIN_BOOTSTRAP_KEY. Call POST /api/auth/admin/bootstrap once with that key, an email, and a new password. The published default key orvexa_bootstrap_2026 is rejected. After bootstrap, sign in with the email you chose.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 16
  ops.push(...text(56, y, 16, '3. Seller / store owner (demo + seed)', 'F2'))
  y -= 24
  const sellers = table(
    56,
    y,
    ['Store', 'Owner', 'Login ID', 'Password'],
    [
      ['Store', 'Owner', 'Login ID', 'Password'],
      ['The Lunar Clothing', 'Gowreesh KP', 'gowreesh@thelunarclothing.com', 'lunar@password'],
      ['Silk Haus', 'Kavya Menon', 'kavya@silkhaus.in', 'silk@password'],
      ['Khadi Studio', 'Arjun Patel', 'arjun@khadistudio.co', 'khadi@password'],
      ['Bloom & Weave', 'Kavita Reddy', 'kavita@bloomweave.in', 'bloom@password'],
    ],
    [20, 14, 32, 18],
  )
  ops.push(...sellers.ops)
  y = sellers.y - 8
  for (const line of wrap(
    'Seed password pattern is <slug>@password. Slugs: lunar, silkhaus, khadistudio, bloomweave. Seed also lists applicant pooja@bloomweave.com (pending, not an owner). Live seller login with lunar@password was rejected; Lunar exists in Atlas with a different password hash.',
    92,
  )) {
    ops.push(...text(56, y, 9, line))
    y -= 12
  }
  return ops
})

pages.push(() => {
  const ops = []
  ops.push(...text(56, 780, 16, '4. Storefront shopper (demo)', 'F2'))
  let y = 754
  const shopper = table(
    56,
    y,
    ['Field', 'Value'],
    [
      ['Field', 'Value'],
      ['Name', 'Priya Sharma'],
      ['Email', 'priya.sharma@example.com'],
      ['Phone', '+91 98765 43210'],
      ['Password', 'lunar123'],
      ['Scope', 'Demo localStorage shopper — not an API user'],
    ],
    [22, 68],
  )
  ops.push(...shopper.ops)
  y = shopper.y - 18
  ops.push(...text(56, y, 16, '5. When these passwords work', 'F2'))
  y -= 24
  const when = table(
    56,
    y,
    ['Environment', 'Admin / seller', 'Shopper'],
    [
      ['Environment', 'Admin / seller', 'Shopper'],
      ['Local Vite (DEV)', 'Yes — demo mode on', 'Yes'],
      ['Local API after npm run seed', 'Yes — seed writes these hashes', 'No'],
      ['Live Pages + Render', 'No', 'No'],
    ],
    [36, 32, 22],
  )
  ops.push(...when.ops)
  y = when.y - 10
  for (const line of wrap(
    'Do not seed production. seed.ts refuses NODE_ENV=production and Atlas URIs that are not clearly staging, test, dev, or local.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 16
  ops.push(...text(56, y, 16, '6. Production secrets — not in this file', 'F2'))
  y -= 24
  const infra = table(
    56,
    y,
    ['System', 'Where the secret lives'],
    [
      ['System', 'Where the secret lives'],
      ['Live Super Admin', 'Mongo admin hash; Render ADMIN_BOOTSTRAP_KEY'],
      ['Live sellers', 'Mongo tenant passwordHash; forgot-password mail'],
      ['MongoDB Atlas', 'Atlas + Render MONGODB_* URIs'],
      ['Render / Cloudflare / GitHub', 'Those dashboards — not app logins'],
      ['JWT / signup HMAC', 'Render JWT_SECRET, JWT_REFRESH_SECRET, SIGNUP_SIGNING_SECRETS'],
    ],
    [28, 62],
  )
  ops.push(...infra.ops)
  y = infra.y - 12
  for (const line of wrap(
    'GitHub Actions must only receive deploy hooks and CLOUDFLARE_API_TOKEN. Application passwords and JWT keys stay on Render. Source for demo rows: src/api/auth.ts, src/api/shopper-accounts.ts, server/src/scripts/seed.ts.',
    92,
  )) {
    ops.push(...text(56, y, 9, line))
    y -= 12
  }
  y -= 20
  ops.push(...text(56, y, 8, '(c) 2026 Orvexa Tech Private Limited  -  Login credentials v1.1  -  Demo values plus live bootstrap'))
  return ops
})

pages.push(() => {
  const ops = []
  ops.push(...text(56, 780, 16, '7. How to turn on live login', 'F2'))
  let y = 756
  for (const line of wrap(
    'Do not run npm run seed against Atlas. Create one super admin with the Render ADMIN_BOOTSTRAP_KEY, then set the Lunar owner password. After the admin exists, delete ADMIN_BOOTSTRAP_KEY from Render.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 8
  ops.push(...text(56, y, 12, '7.1 Copy ADMIN_BOOTSTRAP_KEY from Render', 'F2'))
  y -= 16
  for (const line of wrap(
    'Render -> service orvexa-api -> Environment. Copy ADMIN_BOOTSTRAP_KEY. It is not the published string orvexa_bootstrap_2026.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 6
  ops.push(...text(56, y, 12, '7.2 Create the first super admin (PowerShell)', 'F2'))
  y -= 18
  const cmds = [
    '$env:API_BASE = "https://orvexa-api-nskw.onrender.com"',
    '$env:ADMIN_BOOTSTRAP_KEY = "<paste from Render>"',
    '$env:ADMIN_EMAIL = "hello@orvexatech.com"',
    '$env:ADMIN_PASSWORD = "<at least 12 characters>"',
    '$env:CONFIRM_PRODUCTION_BOOTSTRAP = "yes"',
    'npm run admin:bootstrap',
  ]
  for (const line of cmds) {
    ops.push(...text(56, y, 8, line))
    y -= 12
  }
  y -= 8
  for (const line of wrap(
    '201 = created. 409 = admin already exists, skip to 7.3. 403 = wrong key.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  y -= 6
  ops.push(...text(56, y, 12, '7.3 Set the Lunar seller password', 'F2'))
  y -= 18
  const cmds2 = [
    '$env:API_BASE = "https://orvexa-api-nskw.onrender.com"',
    '$env:ADMIN_EMAIL = "hello@orvexatech.com"',
    '$env:ADMIN_PASSWORD = "<admin password from 7.2>"',
    '$env:STORE_SLUG = "lunar"',
    '$env:SELLER_PASSWORD = "<at least 8 characters>"',
    'npm run seller:set-password',
  ]
  for (const line of cmds2) {
    ops.push(...text(56, y, 8, line))
    y -= 12
  }
  y -= 10
  for (const line of wrap(
    'Admin sign-in: https://orvexa-cloud.pages.dev/ with the 7.2 email and password. Seller sign-in: https://orvexa-cloud.pages.dev/t/lunar/dashboard as gowreesh@thelunarclothing.com with the 7.3 password. Do not write those live passwords into git.',
    92,
  )) {
    ops.push(...text(56, y, 10, line))
    y -= 14
  }
  return ops
})

const pageBufs = pages.map((fn) => pageStream(fn()))
const objects = []
const add = (body) => {
  objects.push(body)
  return objects.length
}

const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
const contentIds = pageBufs.map((buf) => {
  const raw = deflateSync(buf)
  return add(`<< /Length ${raw.length} /Filter /FlateDecode >>\nstream\n${raw.toString('latin1')}\nendstream`)
})
const pageIds = contentIds.map((cid) =>
  add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Contents ${cid} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> >>`),
)
const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
objects[pagesId - 1] = objects[pagesId - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`)
for (const id of pageIds) {
  objects[id - 1] = objects[id - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`)
}
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

let pdf = '%PDF-1.4\n'
const xref = [0]
for (let i = 0; i < objects.length; i++) {
  xref.push(Buffer.byteLength(pdf, 'latin1'))
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
}
const startxref = Buffer.byteLength(pdf, 'latin1')
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (let i = 1; i <= objects.length; i++) {
  pdf += `${String(xref[i]).padStart(10, '0')} 00000 n \n`
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startxref}\n%%EOF`
writeFileSync(out, Buffer.from(pdf, 'latin1'))
console.log(out)
