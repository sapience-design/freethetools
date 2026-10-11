import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// One entry per tools/<category>/<tool>/tool.json; the entry id is "<category>/<tool>".
// Folders starting with "_" (the template) are skipped. The build stops with a clear message
// if a tool.json is missing a field, has the wrong type, or sits in an unknown category.
const tools = defineCollection({
  loader: glob({
    pattern: "[!_]*/[!_]*/tool.json",
    base: "./tools",
    generateId: ({ entry }) => entry.replace(/\/tool\.json$/, ""),
  }),
  schema: z.object({
    name: z.string().min(2).max(40),
    task: z.string().min(4).max(48),
    icon: z.string().regex(/^[a-z0-9-]+$/).optional(),
    short: z.string().min(2).max(24),
    tagline: z.string().min(10).max(110),
    seoTitle: z.string().min(10).max(65),
    description: z.string().min(50).max(160),
    section: z.string(),
    keywords: z.array(z.string()).min(3),
    authors: z.array(z.object({ name: z.string(), github: z.string().optional() })).min(1),
    status: z.enum(["live", "beta"]).default("live"),
    added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    offline: z.boolean().default(true),
    specs: z.record(z.string(), z.string()).default({}),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    vendor: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  }),
});

// One entry per tools/<category>/<tool>/i18n/<lang>.json: the same words as tool.json, in another
// language (docs/adr/0014-languages.md). The entry id is "<category>/<tool>/<lang>". The limits are
// a little wider than tool.json's, because some languages need more letters. The build also checks
// that the FAQ and the spec table have the same number of entries as the English ones.
const toolTexts = defineCollection({
  loader: glob({
    pattern: "[!_]*/[!_]*/i18n/*.json",
    base: "./tools",
    generateId: ({ entry }) => entry.replace(/\/i18n\/([a-z]+)\.json$/, "/$1"),
  }),
  schema: z.object({
    name: z.string().min(2).max(48),
    task: z.string().min(4).max(60),
    tagline: z.string().min(10).max(130),
    seoTitle: z.string().min(10).max(70),
    description: z.string().min(50).max(180),
    keywords: z.array(z.string()).default([]),
    specs: z.record(z.string(), z.string()).optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

export const collections = { tools, toolTexts };
