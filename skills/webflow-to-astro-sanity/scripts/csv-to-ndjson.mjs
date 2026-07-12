#!/usr/bin/env node
/**
 * Convert a Webflow CMS collection CSV export to Sanity NDJSON.
 *
 * Usage:
 *   node csv-to-ndjson.mjs <input.csv> <sanityType> [options] > <output.ndjson>
 *
 * Options:
 *   --image <column>                     Treat <column> (a URL) as an image field.
 *                                        Emits {_type:'image', _sanityAsset:'image@<url>'} —
 *                                        `sanity dataset import` downloads the file and
 *                                        re-hosts it on Sanity's CDN.
 *   --ref <column>=<type>=<targetCsv>    Treat <column> as a reference. Webflow exports
 *                                        references as the target item's SLUG; the target
 *                                        collection's CSV is used to resolve slug → Item ID,
 *                                        producing {_type:'reference', _ref:'<type>-<itemId>'}.
 *                                        Multi-references (semicolon-separated slugs) become
 *                                        an array of references with _key.
 *
 * Example:
 *   node csv-to-ndjson.mjs "csv/site - Tokens - x.csv" token \
 *     --image image --ref "author=author=csv/site - Authors - y.csv" > migration/tokens.ndjson
 *
 * Behavior:
 * - _id is derived from Webflow's "Item ID" column → re-imports are idempotent.
 * - "Name" → name (string), "Slug" → slug ({_type:'slug', current}).
 * - Webflow metadata columns (Collection ID, Locale ID, Item ID, Created/Updated/
 *   Published On) are dropped. Rows with Archived=true or Draft=true are skipped.
 * - Remaining columns become camelCased string fields. Rich text needs manual
 *   mapping to Portable Text — the script warns on stderr.
 */

import {readFileSync} from 'node:fs'

// ---------- arg parsing ----------
const args = process.argv.slice(2)
const positional = []
const imageCols = new Set()
const refCols = new Map() // column -> {type, csvPath}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--image') {
    imageCols.add(args[++i])
  } else if (args[i] === '--ref') {
    const spec = args[++i]
    const [col, type, csvPath] = spec.split('=')
    if (!col || !type || !csvPath) {
      console.error(`Bad --ref spec "${spec}" (expected <column>=<type>=<targetCsv>)`)
      process.exit(1)
    }
    refCols.set(col, {type, csvPath})
  } else {
    positional.push(args[i])
  }
}
const [inputPath, sanityType] = positional
if (!inputPath || !sanityType) {
  console.error(
    'Usage: node csv-to-ndjson.mjs <input.csv> <sanityType> [--image <col>] [--ref <col>=<type>=<targetCsv>]',
  )
  process.exit(1)
}

// ---------- CSV parsing (RFC 4180: quoted fields, embedded commas/newlines) ----------
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

function csvToRecords(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'))
  const header = rows.shift()
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

// ---------- reference lookup tables (slug → target _id) ----------
const refLookups = new Map() // column -> Map(slug → _id)
for (const [col, {type, csvPath}] of refCols) {
  const lookup = new Map()
  for (const rec of csvToRecords(csvPath)) {
    lookup.set(rec['Slug'], `${type}-${rec['Item ID']}`)
  }
  refLookups.set(col, lookup)
}

// ---------- convert ----------
const DROP = new Set([
  'Collection ID',
  'Locale ID',
  'Item ID',
  'Archived',
  'Draft',
  'Created On',
  'Updated On',
  'Published On',
])

const camelCase = (s) =>
  s
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/^[A-Z]/, (ch) => ch.toLowerCase())

const records = csvToRecords(inputPath)
const header = Object.keys(records[0] ?? {})
for (const required of ['Name', 'Slug', 'Item ID']) {
  if (!header.includes(required)) {
    console.error(`Missing expected Webflow column: "${required}"`)
    process.exit(1)
  }
}

const plainCols = header.filter(
  (h) => !DROP.has(h) && h !== 'Name' && h !== 'Slug' && !imageCols.has(h) && !refCols.has(h),
)
if (plainCols.length > 0) {
  console.error(
    `Note: fields exported as plain strings: ${plainCols.join(', ')}.\n` +
      'Rich text needs manual mapping to Portable Text. Use --image / --ref for images and references.',
  )
}

let count = 0
let missingRefs = 0
for (const rec of records) {
  if (rec['Archived'] === 'true' || rec['Draft'] === 'true') continue

  const doc = {
    _id: `${sanityType}-${rec['Item ID']}`,
    _type: sanityType,
    name: rec['Name'],
    slug: {_type: 'slug', current: rec['Slug']},
  }

  for (const col of imageCols) {
    const url = rec[col]
    if (url) doc[camelCase(col)] = {_type: 'image', _sanityAsset: `image@${url}`}
  }

  for (const [col] of refCols) {
    const value = rec[col]
    if (!value) continue
    const lookup = refLookups.get(col)
    const slugs = value.split(';').map((s) => s.trim()).filter(Boolean)
    const refs = slugs.map((slug) => {
      const target = lookup.get(slug)
      if (!target) {
        missingRefs++
        console.error(`WARNING: ${doc._id}: no item with slug "${slug}" in ${refCols.get(col).csvPath}`)
        return null
      }
      return {_type: 'reference', _ref: target, _key: target}
    }).filter(Boolean)
    if (refs.length === 0) continue
    doc[camelCase(col)] = slugs.length > 1 ? refs : {_type: 'reference', _ref: refs[0]._ref}
  }

  for (const col of plainCols) {
    const value = rec[col]
    if (value !== '') doc[camelCase(col)] = value
  }

  process.stdout.write(JSON.stringify(doc) + '\n')
  count++
}
console.error(
  `Wrote ${count} document(s) of type "${sanityType}".` +
    (missingRefs ? ` ${missingRefs} unresolved reference(s) — fix before importing.` : ''),
)
