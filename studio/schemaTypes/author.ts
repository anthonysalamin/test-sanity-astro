import {defineField, defineType} from 'sanity'

/**
 * Author — mirrors the Webflow "Authors" collection (built-in fields only).
 */
export const author = defineType({
  name: 'author',
  title: 'Author',
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
