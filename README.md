# test-sanity-astro

Webflow → Astro + Sanity migration. Monorepo:

```
├── studio/     # Sanity Studio (project nk9wf9nw, dataset production)
├── web/        # Astro front end (fully static, reads Sanity at build time)
├── migration/  # tokens.ndjson — Webflow CMS export converted for Sanity import
└── netlify.toml
```

## 1. Install & log in (run once, on your machine)

```bash
cd studio && npm install && cd ../web && npm install && cd ..
npx -y sanity@latest login   # or: cd studio && npx sanity login
```

## 2. Import the Webflow content

```bash
cd studio
npx sanity dataset import ../migration/tokens.ndjson production
```

This creates the two `token` documents (btc, eth). Verify at http://localhost:3333 after `npm run dev` in `studio/`.

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

## Recurring cost

Sanity free tier + Netlify free tier + GitHub free = $0/month at this scale.

## Notes

- The token schema (`studio/schemaTypes/token.ts`) mirrors Webflow's Tokens collection, which only had built-in fields (Name, Slug). Add fields there as needed; they become editable in the Studio immediately.
- The site is fully static (`output: 'static'`), so Sanity is only queried at build time — zero runtime API usage.
