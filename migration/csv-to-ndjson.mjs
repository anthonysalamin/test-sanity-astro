#!/usr/bin/env node
/**
 * Convert a Webflow CMS collection CSV export to Sanity NDJSON.
 *
 * Usage:
 *   node csv-to-ndjson.mjs <input.csv> <sanityType> > <output.ndjson>
 *   node csv-to-ndjson.mjs "test-astro-sanity - Tokens - xxx.csv" token > tokens.ndjson
 *
 * Behavior:
 * - _id is derived from Webflow's "Item ID" column → re-imports are idempotent.
 * - "Name" → name (string), "Slug" → slug ({_type:'slug', current}).
 * - Webflow metadata columns (Collection ID, Locale ID, Item ID, Created/Updated/
 *   Published On) are dropped.
 * - Rows with Archived=true or Draft=true are skipped.
 * - Any other (custom) column becomes a camelCased string field. Rich text,
 *   images, and references need manual mapping — the script warns on stderr.
 */

import {readFileSync} from 'node:fs'

const [, , inputPath, sanityType] = process.argv
if (!inputPath || !sanityType) {
  console.error('Usage: node csv-to-ndjson.mjs <input.csv> <sanityType>')
  process.exit(1)
}

// Minimal RFC 4180 CSV parser (handles quoted fields, embedded commas/newlines).
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

const rows = parseCsv(readFileSync(inputPath, 'utf8'))
const header = rows.shift()
const idx = Object.fromEntries(header.map((h, i) => [h, i]))

for (const required of ['Name', 'Slug', 'Item ID']) {
  if (!(required in idx)) {
    console.error(`Missing expected Webflow column: "${required}"`)
    process.exit(1)
  }
}

const customCols = header.filter((h) => !DROP.has(h) && h !== 'Name' && h !== 'Slug')
if (customCols.length > 0) {
  console.error(
    `Note: custom fields exported as plain strings: ${customCols.join(', ')}.\n` +
      'Rich text (→ Portable Text blocks), images, and references need manual mapping.',
  )
}

let count = 0
for (const row of rows) {
  const get = (col) => (row[idx[col]] ?? '').trim()
  if (get('Archived') === 'true' || get('Draft') === 'true') continue

  const doc = {
    _id: `${sanityType}-${get('Item ID')}`,
    _type: sanityType,
    name: get('Name'),
    slug: {_type: 'slug', current: get('Slug')},
  }
  for (const col of customCols) {
    const value = get(col)
    if (value !== '') doc[camelCase(col)] = value
  }
  process.stdout.write(JSON.stringify(doc) + '\n')
  count++
}
console.error(`Wrote ${count} document(s) of type "${sanityType}".`)
