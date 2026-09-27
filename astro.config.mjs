// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://freethetools.com",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  build: { format: "directory" },
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
