// Tool groups, in sidebar order. A tool lives at tools/<category slug>/<tool slug>/.
// Add a group here before adding its first tool.
export const CATEGORIES = [
  { slug: "pdf", name: "PDF", title: "Free PDF tools", blurb: "Compress, merge, split, fill and convert PDFs in your browser.", sections: ["Optimize", "Organize", "Edit", "Convert", "Security"] },
  { slug: "images", name: "Images", title: "Free image tools", blurb: "Resize, compress and convert photos without uploading them.", sections: ["Optimize", "Convert", "Privacy"] },
  { slug: "text", name: "Text", title: "Free text tools", blurb: "Count, compare and transform text.", sections: ["Count & Compare", "Transform"] },
  { slug: "data", name: "Data", title: "Free data tools", blurb: "Convert and tidy CSV and JSON.", sections: ["Convert", "Format"] },
  { slug: "developer", name: "Developer", title: "Free developer tools", blurb: "Encoders, hashes, generators, decoders and testers.", sections: ["Encode", "Inspect", "Generate"] },
  { slug: "everyday", name: "Everyday", title: "Free everyday tools", blurb: "Unit and time-zone converters and other daily helpers.", sections: ["Convert", "Time"] },
] as const;

export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as string[];
export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
