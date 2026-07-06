import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * `guides` — the product's evergreen photography articles (change
 * landing-content, Phase 2). Also the landing's SEO surface. Markdown bodies
 * are EN-only content, deliberately NOT strings-module material (the i18n slice
 * is #7); teaser + meta copy read the typed frontmatter below.
 *
 * Covers/illustrative images live in `public/images/guides/*`, so `cover` is a
 * URL string (the `astro:content` `image()` helper only validates assets
 * co-located under `src/`). Every image is traceable to a `credits[]` entry —
 * source + license — even where attribution isn't strictly required.
 */
const guides = defineCollection({
  loader: glob({ base: "./src/content/guides", pattern: "**/[^_]*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    readingMinutes: z.number().int().positive(),
    publishedAt: z.coerce.date(),
    cover: z.string(),
    coverAlt: z.string(),
    credits: z
      .array(
        z.object({
          source: z.string(),
          license: z.string(),
          url: z.url(),
        }),
      )
      .default([]),
  }),
});

export const collections = { guides };
