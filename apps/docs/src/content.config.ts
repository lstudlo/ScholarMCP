import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const heroActionSchema = z.object({
  text: z.string(),
  link: z.string(),
  icon: z.string().optional(),
  variant: z.enum(['minimal']).optional()
});

const docsSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  template: z.enum(['splash']).optional(),
  hero: z
    .object({
      title: z.string().optional(),
      tagline: z.string().optional(),
      actions: z.array(heroActionSchema).optional()
    })
    .optional(),
  sidebar: z
    .looseObject({
      order: z.number().optional()
    })
    .optional(),
  draft: z.boolean().optional()
});

export const collections = {
  docs: defineCollection({
    loader: glob({
      pattern: '**/*.md',
      base: './src/content/docs'
    }),
    schema: docsSchema
  })
};
