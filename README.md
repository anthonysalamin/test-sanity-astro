# test-sanity-astro

Webflow → Astro + Sanity migration. Monorepo:

```
├── webflow/    # (input) Webflow site export — permanent reference, never edited
├── csv/        # (input) Webflow CMS exports, one CSV per collection
├── studio/     # Sanity Studio (project nk9wf9nw, dataset production)
├── web/        # Astro front end (fully static, reads Sanity at build time)
├── migration/  # csv-to-ndjson.mjs converter + NDJSON files for Sanity import
└── netlify.toml
```

> **Note:** there is no root `package.json` — always run `npm` commands *inside* `studio/` or `web/`. If an accidental root `npm install` creates a root `package-lock.json`, delete it. Commit the lockfiles inside `web/` and `studio/` whenever they change.

## 1. Install & log in (run once, on your machine)

```bash
cd studio && npm install && cd ../web && npm install && cd ..
npx -y sanity@latest login   # or: cd studio && npx sanity login
```

## 2. Import the Webflow content

```bash
cd studio
npx sanity dataset import ../migration/authors.ndjson --dataset production --replace   # referenced collection first
npx sanity dataset import ../migration/tokens.ndjson --dataset production --replace    # downloads + re-hosts images
# --replace is always safe here: _ids derive from Webflow Item IDs, so imports
# create missing documents and update existing ones (idempotent re-runs)
```

Order matters: tokens reference authors, so authors import first. The token import also downloads each image from Webflow's CDN and re-hosts it on Sanity (Webflow's CDN dies when the subscription ends). Verify at http://localhost:3333 after `npm run dev` in `studio/`.

To regenerate the NDJSON after a CSV changes:

```bash
node migration/csv-to-ndjson.mjs "csv/<authors>.csv" author > migration/authors.ndjson
node migration/csv-to-ndjson.mjs "csv/<tokens>.csv" token \
  --image image --ref "author=author=csv/<authors>.csv" > migration/tokens.ndjson
```

## 3. Run locally

```bash
cd studio && npm run dev   # Studio at localhost:3333
cd web && npm run dev      # Site at localhost:4321
```

First Studio run may ask you to add `http://localhost:3333` as a CORS origin — accept, or add it at sanity.io/manage.

## 4. Push to GitHub

```bash
git add -A && git commit -m "Migrate Webflow site to Astro + Sanity"
gh repo create test-sanity-astro --private --source . --push
# or create the repo on github.com and: git remote add origin <url> && git push -u origin main
```

## 5. Deploy

**Site (Netlify):** New site from Git → pick the repo. `netlify.toml` already sets base `web`, command `npm run build`, publish `dist`. No environment variables needed (dataset is public, content is read at build time).

**Studio (free Sanity hosting):**

```bash
cd studio && npx sanity deploy   # choose a hostname → https://<name>.sanity.studio
```

## 6. Rebuild on publish (Sanity webhook → Netlify)

1. Netlify → Site configuration → Build & deploy → **Build hooks** → Add build hook (e.g. "sanity-publish") → copy the URL.
2. [sanity.io/manage](https://www.sanity.io/manage) → project **TEST SANITY** → API → **Webhooks** → Create:
   - URL: the Netlify build hook URL
   - Dataset: `production`
   - Trigger on: create, update, delete
   - HTTP method: POST
3. Publish a change in the Studio → Netlify rebuilds → site updates in ~1 min.

## 7. Let a customer edit the CMS (no code, no Cursor)

The deployed Studio is the customer-facing editor — like Webflow's Editor, but hosted at your own URL.

1. Deploy it once: `cd studio && npx sanity deploy` → pick a hostname → `https://<name>.sanity.studio` (free Sanity hosting).
2. Invite the customer at [sanity.io/manage](https://www.sanity.io/manage) → project **TEST SANITY** → **Members** → Invite, role **Editor** (can create/edit/publish content; cannot touch settings, tokens, or billing). Free tier: up to 20 members.
3. Their workflow: open the Studio URL → log in → add/edit tokens → **Publish** → webhook rebuilds Netlify → live site updates in ~1 min.

To add fields later: edit `studio/schemaTypes/token.ts`, run `npx sanity deploy` again — editors see the new fields immediately. Bulk imports still work anytime: drop the CSV in `csv/`, then `node migration/csv-to-ndjson.mjs csv/<file>.csv token > migration/<name>.ndjson` and `npx sanity dataset import` from `studio/`.

## Recurring cost

Sanity free tier + Netlify free tier + GitHub free = $0/month at this scale.

## Notes

- The token schema (`studio/schemaTypes/token.ts`) mirrors Webflow's Tokens collection, which only had built-in fields (Name, Slug). Add fields there as needed; they become editable in the Studio immediately.
- The site is fully static (`output: 'static'`), so Sanity is only queried at build time — zero runtime API usage.
