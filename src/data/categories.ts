// Tool groups, in display order. A tool lives at tools/<category slug>/<tool slug>/.
// Add a group here before adding its first tool. `label` is how a sentence names the group
// ("Image tools"); `mark` is a Phosphor icon name; `shot` is the
// tool whose product shot heads the group page; the tint for each group is in src/styles/global.css.
export const CATEGORIES = [
  { slug: "pdf", name: "PDF", label: "PDF tools", title: "Free PDF tools", mark: "file-pdf", shot: "pdf/merge", blurb: "Compress, merge, split, fill and convert PDFs.", sub: "Pick what you want to do. Your files stay on this device.", sections: ["Optimize", "Organize", "Edit", "Convert"] },
  { slug: "images", name: "Images", label: "Image tools", title: "Free image tools", mark: "mountains", shot: "images/resize", blurb: "Resize, compress and convert photos.", sub: "Pick what you want to do. Your photos stay on this device.", sections: ["Optimize", "Convert", "Privacy"] },
  { slug: "text", name: "Text", label: "Text tools", title: "Free text tools", mark: "text-aa", shot: "text/word-counter", blurb: "Count, compare and change text.", sub: "Pick what you want to do. Your text stays on this device.", sections: ["Count & Compare", "Transform"] },
  { slug: "data", name: "Data", label: "Data tools", title: "Free data tools", mark: "brackets-curly", shot: "data/json-formatter", blurb: "Convert and tidy CSV and JSON.", sub: "Pick what you want to do. Your data stays on this device.", sections: ["Convert", "Format"] },
  { slug: "developer", name: "Developer", label: "Developer tools", title: "Free developer tools", mark: "code", shot: "developer/qr-code-maker", blurb: "Encoders, hashes, generators, decoders and testers.", sub: "Pick what you want to do. Nothing you paste leaves this device.", sections: ["Encode", "Inspect", "Generate"] },
  { slug: "everyday", name: "Everyday", label: "Everyday tools", title: "Free everyday tools", mark: "compass", shot: "everyday/time-zone-converter", blurb: "Unit and time zone converters.", sub: "Pick what you want to do. Everything runs on this device.", sections: ["Convert", "Time"] },
] as const;

export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as string[];
export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
