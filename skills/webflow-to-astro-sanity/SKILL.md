---
name: webflow-to-astro-sanity
description: Migrate a Webflow site with CMS collections to a pixel-perfect Astro front end backed by Sanity, hosted on GitHub, deployed on Netlify with webhook-triggered rebuilds. Expects the repo to contain the Webflow exports (webflow/ folder + csv/ folder). Use when the user wants to move off Webflow onto a code-owned Astro + Sanity stack, mentions "Webflow export", "Webflow CMS migration", or "rebuild Webflow in Astro".
---

# Webflow → Astro + Sanity migration

Converts a Webflow site export (+ CMS CSV exports) into a monorepo: Sanity Studio (`studio/`), static Astro app (`web/`), deployed on Netlify, rebuilt via Sanity webhook. Target recurring cost: $0 (all free tiers).

**Non-negotiable requirement: the Astro site must render pixel-perfect identical to the Webflow original.** This is achieved by reusing the export's own CSS files verbatim and reproducing its exact DOM structure (see Step 4). Never substitute custom styles, semantic-HTML rewrites, or added elements for what the export contains — visual parity beats markup elegance.

## Expected repo layout (inputs)

The repo starts with the raw Webflow exports committed at the root:

```
root/
├── webflow/   # Webflow SITE export: the zip from Site settings → Export code,
│              # or its unzipped contents (index.html, detail_*.html, css/, js/, images/)
└── csv/       # Webflow CMS exports: one CSV per collection
               # (Collection settings → Export)
```

**Step 0 — normalize the inputs.** If `webflow/` contains a zip, unzip it in place (`cd webflow && unzip *.zip`) so `index.html` and `css/` sit directly under `webflow/`. Keep these folders committed: they are the permanent source-of-truth reference for pixel-parity checks and future re-conversions. The user must also have a Sanity project ID + dataset (created free at sanity.io).

## Step 1 — Analyze the export before writing anything

- List every HTML page under `webflow/` and read each one. Detail pages named `detail_<collection>.html` are CMS template pages.
- Check `webflow/css/<site-name>.webflow.css` — this is the ONLY site-specific stylesheet. `normalize.css` and `webflow.css` are framework files; the site's base look (Arial 14px/20px, #333, margin 0) comes from them, NOT from browser defaults.
- Read every CSV header in `csv/` to enumerate collections and fields. Webflow always includes built-ins: Name, Slug, Collection ID, Locale ID, Item ID, Archived, Draft, Created/Updated/Published On. Everything after those is a custom field.

## Step 2 — Target monorepo layout

```
root/
├── webflow/      # (input) Webflow site export — keep committed, never edit
├── csv/          # (input) CMS CSV exports — keep committed, never edit
├── studio/       # (generated) Sanity Studio
├── web/          # (generated) Astro app
├── migration/    # (generated) csv-to-ndjson.mjs converter + NDJSON output
├── netlify.toml
├── .gitignore    # node_modules, .env*, .DS_Store
└── README.md
```

Keep the Studio standalone (do NOT embed in Astro). There is deliberately no root package.json — all `npm` commands must run inside `studio/` or `web/`. Running `npm install` at the root fails with ENOENT and can leave a stray root `package-lock.json`; delete it if it appears (it can confuse Netlify's dependency detection). Commit each app's own `package-lock.json` after installing — it pins the exact versions Netlify builds with.

## Step 3 — Scaffold the Studio by hand (no CLI, no auth needed)

Writing files directly avoids `npm create sanity` (which requires interactive login). Files:

- `studio/package.json` — scripts `dev/build/deploy` → `sanity dev/build/deploy`. Deps: `sanity`, `@sanity/vision`, `react`, `react-dom`, `styled-components`; devDeps `typescript`, `@types/react`.

**Version policy: always use the latest stable major of every dependency.** Check with `npm view <pkg> version` at migration time (do not assume from memory — majors move fast) and set `^<latest-major>.0.0`. Then verify with a real `npm install` + build before handing off; if the latest major breaks the scaffold, fix the code to match the new API rather than pinning back.

- `studio/sanity.config.ts` — `defineConfig` with `projectId`, `dataset`, `plugins: [structureTool(), visionTool()]`, `schema: {types: schemaTypes}`.
- `studio/sanity.cli.ts` — `defineCliConfig` with same projectId/dataset. If enabling auto-updates, use the nested form `deployment: {autoUpdates: true}` (top-level `autoUpdates` is deprecated and warns on every CLI run). After the first `sanity deploy`, add the printed `appId` under `deployment` too, so later deploys don't prompt.
- `studio/schemaTypes/index.ts` + one schema file per collection found in `csv/`.
- `studio/tsconfig.json`, `studio/.gitignore` (`node_modules`, `dist`, `.sanity`, `.env*`).

### Webflow → Sanity field type mapping

| Webflow field | Sanity type |
|---|---|
| Name (built-in) | `string`, required |
| Slug (built-in) | `slug` with `options: {source: 'name'}`, required |
| Plain text | `string` (or `text` for multiline) |
| Rich text | `array` of `block` (Portable Text) |
| Image | `image` |
| Number | `number` |
| Switch | `boolean` |
| Option | `string` with `options.list` |
| Date | `datetime` |
| Link/URL | `url` |
| Color | `string` |
| Reference | `reference` to the target type |
| Multi-reference | `array` of `reference` |

Ignore Webflow's Collection ID / Locale ID / Archived / Draft columns; use Item ID for document `_id` (see Step 5).

## Step 4 — Scaffold the Astro app (static output)

- `web/package.json` — deps: `astro`, `@sanity/client` only (latest stable majors — see version policy in Step 3). No adapter needed: fully static output means Sanity is queried at build time only, and the Netlify webhook rebuild model handles freshness.
- `web/astro.config.mjs` — `defineConfig({output: 'static'})`.
- `web/src/lib/sanity.ts` — `createClient({projectId, dataset, apiVersion: '<today YYYY-MM-DD>', useCdn: true})` plus typed GROQ fetch helpers, e.g. `*[_type == "token"] | order(name asc) {_id, name, slug}`.
  - Ordering gotcha: Webflow lists show Designer-defined order; pick the GROQ `order()` that matches the live site.
- `web/tsconfig.json` extends `astro/tsconfigs/strict`; `.gitignore`: `node_modules`, `dist`, `.astro`, `.env*`.

### Pixel-perfect rules (this is what people get wrong)

1. **Copy `webflow/css/`, `webflow/images/`, and `webflow/js/webflow.js` untouched** into `web/public/`, keeping identical relative paths (`/css/...`, `/images/...`, `/js/webflow.js`).
2. **Mirror the exported `<head>` exactly** in a `Layout.astro`: same stylesheet order (`normalize.css` → `webflow.css` → site css), the inline `w-mod-js` touch-detection script (use `is:inline`), favicon + webclip links.
3. **Mirror the body DOM exactly**, including Webflow classes: `w-dyn-list` > `w-dyn-items` (`role="list"`) > `w-dyn-item` (`role="listitem"`), and `w-dyn-empty` for the empty state. Do NOT "improve" markup: no `<ul>`/`<li>` (adds bullets/indentation), no added wrappers, no body padding, no custom resets, no `<a>` where Webflow rendered plain divs.
4. Keep the jQuery CDN script + `/js/webflow.js` at the end of `<body>` (needed for Webflow interactions; harmless otherwise).
5. Replace each CMS binding with the Sanity field; replace collection lists with a `.map()` over the fetched documents.
6. Detail pages: one `web/src/pages/<collection>/[slug].astro` per `detail_<collection>.html`, using `getStaticPaths()` over all documents.

## Step 5 — Convert every CSV in csv/ to NDJSON

Use the bundled converter (`scripts/csv-to-ndjson.mjs`, dependency-free Node) rather than converting by hand — once per file in `csv/`:

```bash
# simple collection (built-in fields + plain text)
node scripts/csv-to-ndjson.mjs "csv/<export>.csv" <sanityType> > migration/<collection>.ndjson

# collection with an image column and a reference column
node scripts/csv-to-ndjson.mjs "csv/<tokens>.csv" token \
  --image image \
  --ref "author=author=csv/<authors>.csv" > migration/tokens.ndjson
```

It parses the Webflow CSV (RFC 4180, quoted fields), derives `_id` from the Item ID column, maps Name/Slug to the built-in fields, drops Webflow metadata columns, skips Archived/Draft rows, and exports remaining columns as camelCased string fields. Two flags handle the non-string field types:

- `--image <column>` — Webflow exports image fields as URLs on `cdn.prod.website-files.com`. **That CDN disappears when the Webflow subscription ends**, so the images must be re-hosted: the flag emits `{"_type":"image","_sanityAsset":"image@<url>"}` and `sanity dataset import` downloads each file and stores it in Sanity's asset store.
- `--ref <column>=<targetType>=<targetCsv>` — Webflow exports reference fields as the target item's **slug**, not its ID. The flag resolves slug → Item ID via the referenced collection's CSV and emits `{"_type":"reference","_ref":"<type>-<itemId>"}`. Multi-reference columns (semicolon-separated slugs) become an array of keyed references. Unresolved slugs print a WARNING on stderr — fix them before importing.

Rules and gotchas:

- `_id` derived from the Webflow Item ID → idempotent re-imports (no duplicates).
- Slugs must be objects: `{"_type":"slug","current":"..."}`.
- **Import order matters with references:** import referenced collections first (`authors.ndjson` before `tokens.ndjson`) — a strong reference to a missing document fails the import.
- Rich text still needs manual conversion to Portable Text blocks.
- Validate with `jq -c . file.ndjson` before handing off.
- Documents created manually in the Studio have random `_id`s; if the same item also arrives via CSV import, you get a duplicate. Delete the Studio-created copy.

## Step 6 — Commands the USER must run locally (require their credentials)

```bash
cd studio && npm install && npx sanity login
# Login gotcha: "log in or create a new account" appears for everyone.
# They must pick the SAME provider (Google/GitHub/email) used to create the
# Sanity project — a different provider silently logs into a different
# account and the import fails with a permissions error on the project.
# Fix: npx sanity logout, retry with the right provider.

npx sanity dataset import ../migration/<collection>.ndjson --dataset production
# once per collection — referenced collections FIRST (e.g. authors before tokens)
# Re-importing docs that already exist? Add --replace (default mode is
# create-only and fails the whole batch with "Document by ID ... already exists").
npm run dev        # Studio at localhost:3333 — accept the CORS origin prompt
cd ../web && npm install && npm run dev   # site at localhost:4321
```

Verify a build-time read works without a token: Sanity datasets are public-read by default, so `https://<projectId>.apicdn.sanity.io/v<apiVersion>/data/query/<dataset>?query=*%5B_type%3D%3D%22<type>%22%5D` should return JSON. If the dataset is private, the Astro client needs a read token via env var instead.

## Step 7 — GitHub + Netlify + webhook

`netlify.toml` at repo root:

```toml
[build]
  base = "web"
  command = "npm run build"
  publish = "dist"
```

1. Push repo to GitHub (`gh repo create <name> --private --source . --push`).
2. Netlify → Add new site → Import from Git. No env vars needed for public datasets.
3. Studio hosting (free): `cd studio && npx sanity deploy` → `https://<name>.sanity.studio`.
4. Rebuild-on-publish: Netlify → Build hooks → create hook, copy URL. Then sanity.io/manage → project → API → Webhooks → create: URL = build hook, dataset = production, trigger on create/update/delete, POST. Publishing in the Studio now rebuilds the site in ~1 min.

## Step 8 — Hand off content editing to the customer

The deployed Studio is the customer-facing CMS (the equivalent of Webflow's Editor). Customers never touch code or sanity.io/manage — they edit at the Studio URL.

1. Deploy the Studio (if not done in Step 7): `cd studio && npx sanity deploy` → `https://<name>.sanity.studio`, hosted free by Sanity.
2. Invite the customer: sanity.io/manage → project → **Members** → Invite by email with the **Editor** role (create/edit/publish content; no access to project settings, API tokens, or billing). Free tier includes up to 20 members.
3. Customer workflow: open the Studio URL → log in → add/edit documents → **Publish** → the Sanity webhook triggers a Netlify rebuild → live site updates in ~1 min.
4. Schema changes stay with the developer: add fields in `studio/schemaTypes/`, then `npx sanity deploy` again — editors see the new fields immediately. The code-defined schema is a guardrail: editors can only fill in the fields you shipped.

## Verification checklist

- [ ] `webflow/` and `csv/` are committed and untouched (inputs are the permanent reference).
- [ ] `npm install` and `astro build` succeed in `web/` (build fetches Sanity, so run after import).
- [ ] Rendered page DOM matches `webflow/<page>.html` byte-for-byte apart from CMS bindings (diff `view-source` if in doubt).
- [ ] List ordering matches the live Webflow site.
- [ ] NDJSON is valid (`jq -c .`) and re-import is idempotent (stable `_id`s).
- [ ] Publishing a Studio change triggers a Netlify deploy.

## Common failure modes

| Symptom | Cause / fix |
|---|---|
| Site renders "wrong" vs Webflow | Exported CSS not copied from `webflow/css/`, wrong stylesheet order, or "improved" markup (`ul`, padding, links). Mirror the export exactly. |
| `sanity dataset import` → permission error | Logged into wrong Sanity account (different OAuth provider). `npx sanity logout` + retry. |
| Build works locally, empty list on Netlify | Content not published (drafts aren't visible to unauthenticated reads) or wrong dataset name. |
| Duplicate documents after re-import | Random `_id`s. Always derive `_id` from Webflow Item ID; delete Studio-created copies of imported items. |
| Import fails on a reference | Referenced collection not imported yet, or slug missing from the target CSV. Import targets first; heed converter WARNINGs. |
| `Document by ID "..." already exists` | Import is create-only by default. Re-run with `--replace` to update existing documents (safe: same `_id`s = same items). |
| Images broken months after migration | `<img>` still points at `cdn.prod.website-files.com` (dies with the Webflow subscription). Use `--image` so imports re-host assets on Sanity, and render `image.asset->url`. |
| Stale content after publishing | Webhook not firing — check it targets the Netlify build hook URL and the right dataset. |
| `npm error ENOENT ... package.json` at repo root | Commands run from the wrong folder — the monorepo root has no package. `cd web` or `cd studio` first; delete any stray root `package-lock.json` it created. |
| Multi-line command pastes misfire (`git pushcd web`) | Terminal concatenated pasted lines. Paste one line at a time, or use `&&`-joined single lines. |
