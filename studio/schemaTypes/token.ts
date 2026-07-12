import {defineField, defineType} from 'sanity'

/**
 * Token — mirrors the Webflow "Tokens" collection.
 * Fields: Name, Slug (built-in), image (Image), author (Reference → Authors).
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
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{type: 'author'}],
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'slug.current', media: 'image'},
  },
})
