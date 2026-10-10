// @ts-check
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { buildServiceWorker } from "./scripts/build-sw.mjs";
import { languageNotFoundPages } from "./scripts/lang-404.mjs";

// Once the pages are built: turns each language's 404 page into a file, and writes dist/sw.js, which lists the
// hashed CSS and JS files of the pages.
const serviceWorker = {
  name: "service-worker",
  hooks: { "astro:build:done": ({ dir }) => { languageNotFoundPages(fileURLToPath(dir)); buildServiceWorker(fileURLToPath(dir)); } },
};

export default defineConfig({
  site: "https://freethetools.com",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  build: { format: "directory" },
  integrations: [serviceWorker],
  vite: {
    // npm run dev only: bundle every library the browser uses when the server starts. Otherwise
    // Vite finds them page by page and rebuilds its bundles each time, and a page that loaded the
    // old bundle loses its script (a 504 "Outdated Optimize Dep") until it is reloaded. Keep this
    // list in step with the libraries imported by tools/*/*/ and src/.
    optimizeDeps: {
      include: ["diff", "dompurify", "fflate", "marked", "minisearch", "papaparse", "pdf-lib", "pdfjs-dist", "qrcode-generator", "turndown"],
    },
  },
  security: {
    // "Nothing is uploaded" is enforced here, not just promised: pages may only
    // talk to their own origin. Astro adds hashes for its own scripts and styles.
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
});
