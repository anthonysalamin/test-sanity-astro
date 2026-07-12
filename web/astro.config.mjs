// @ts-check
import {defineConfig} from 'astro/config'

// Fully static output: pages are rendered at build time from Sanity content.
// A Sanity webhook pointed at Netlify's build hook triggers a rebuild on publish.
export default defineConfig({
  output: 'static',
})
