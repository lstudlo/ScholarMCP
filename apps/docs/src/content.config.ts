import { defineCollection, z } from 'astro:content';
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
    .object({
      order: z.number().optional()
    })
    .passthrough()
    .optional(),
  draft: z.boolean().optional()
});

export const collections = {
  docs: defineCollection({
    loader: glob({
      pattern: '**/*.{md,mdx}',
      base: './src/content/docs'
    }),
    schema: docsSchema
  })
};
