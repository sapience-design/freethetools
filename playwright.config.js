import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the built site served by Wrangler, so Cloudflare's _headers apply
// exactly as in production. Run `npm run build` first.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:8788" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx wrangler pages dev dist --port 8788",
    url: "http://localhost:8788",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
