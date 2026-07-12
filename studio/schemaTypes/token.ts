import {defineField, defineType} from 'sanity'

/**
 * Token — mirrors the Webflow "Tokens" collection.
 * Webflow's export only contained the built-in fields (Name, Slug);
 * add more fields here as the collection grows.
 */
export const token = defineType({
  name: 'token',
  title: 'Token',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'slug.current'},
  },
})
