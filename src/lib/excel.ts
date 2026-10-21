/** Build and download a real Excel workbook (.xlsx) with no extra packages. */

export type ExcelCell = string | number | boolean | null | undefined
export type ExcelSheet = { name: string; rows: ExcelCell[][] }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2)
  new DataView(b.buffer).setUint16(0, n & 0xffff, true)
  return b
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n >>> 0, true)
  return b
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const encoder = new TextEncoder()

  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length
    const local = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ])
    const central = concat([
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const centralDir = concat(centrals)
  const end = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ])
  return concat([...locals, centralDir, end])
}

function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colLetter(index: number): string {
  let n = index + 1
  let label = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    label = String.fromCharCode(65 + rem) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let clean = name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet'
  clean = clean.slice(0, 31)
  let candidate = clean
  let i = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`
    candidate = `${clean.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    i += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function cellXml(value: ExcelCell, ref: string): string {
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"/>`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`
}

function sheetXml(rows: ExcelCell[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(value, `${colLetter(c)}${r + 1}`)).join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`
}

function workbookRels(count: number): string {
  const rels = Array.from({ length: count }, (_, i) => {
    return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

function contentTypes(count: number): string {
  const overrides = Array.from({ length: count }, (_, i) => {
    return `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}
</Types>`
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

function encodeXml(xml: string): Uint8Array {
  return new TextEncoder().encode(xml)
}

export function excelBlob(sheets: ExcelSheet[]): Blob {
  const used = new Set<string>()
  const named = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [['(empty)']] }]).map((sheet) => ({
    name: sanitizeSheetName(sheet.name, used),
    rows: sheet.rows.length ? sheet.rows : [['(empty)']],
  }))
  const files = [
    { name: '[Content_Types].xml', data: encodeXml(contentTypes(named.length)) },
    { name: '_rels/.rels', data: encodeXml(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: encodeXml(workbookXml(named.map((s) => s.name))) },
    { name: 'xl/_rels/workbook.xml.rels', data: encodeXml(workbookRels(named.length)) },
    ...named.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encodeXml(sheetXml(sheet.rows)),
    })),
  ]
  const zip = zipStore(files)
  const copy = new ArrayBuffer(zip.byteLength)
  new Uint8Array(copy).set(zip)
  return new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadExcel(filename: string, sheets: ExcelSheet[]): void {
  const name = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`
  const url = URL.createObjectURL(excelBlob(sheets))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', name)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function cellFromUnknown(value: unknown): ExcelCell {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function recordsToRows(records: Array<Record<string, unknown>>): ExcelCell[][] {
  if (!records.length) return [['(no rows)']]
  const keys = [...new Set(records.flatMap((row) => Object.keys(row)))]
  return [keys, ...records.map((row) => keys.map((key) => cellFromUnknown(row[key])))]
}
