import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the built site served by Wrangler, so Cloudflare's _headers apply
// exactly as in production. Run `npm run build` first.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:8788" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    // The real Worker with a local copy of the stats database, migrated first.
    command: "npx wrangler d1 migrations apply DB --local && npx wrangler dev --port 8788",
    url: "http://localhost:8788",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
