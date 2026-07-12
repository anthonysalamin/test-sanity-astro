import {createClient} from '@sanity/client'

export const sanityClient = createClient({
  projectId: 'nk9wf9nw',
  dataset: 'production',
  apiVersion: '2026-07-01',
  useCdn: true, // fine for build-time reads of published content
})

export interface Token {
  _id: string
  name: string
  slug: {current: string}
}

export async function getTokens(): Promise<Token[]> {
  return sanityClient.fetch(
    `*[_type == "token"] | order(name asc) { _id, name, slug }`,
  )
}
