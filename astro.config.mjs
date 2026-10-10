// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://freethetools.com",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  build: { format: "directory" },
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
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
});
