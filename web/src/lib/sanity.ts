import {createClient} from '@sanity/client'

export const sanityClient = createClient({
  projectId: 'nk9wf9nw',
  dataset: 'production',
  apiVersion: '2026-07-01',
  useCdn: false, // build-time only: always read fresh data, so webhook-triggered
  // rebuilds never pick up a stale CDN cache of just-published content
})

export interface Author {
  _id: string
  name: string
  slug: {current: string}
}

export interface Token {
  _id: string
  name: string
  slug: {current: string}
  imageUrl?: string
  author?: Author
}

export async function getTokens(): Promise<Token[]> {
  return sanityClient.fetch(
    `*[_type == "token"] | order(name asc) {
      _id, name, slug,
      "imageUrl": image.asset->url,
      author->{_id, name, slug}
    }`,
  )
}

export async function getAuthors(): Promise<Author[]> {
  return sanityClient.fetch(
    `*[_type == "author"] | order(name asc) { _id, name, slug }`,
  )
}
