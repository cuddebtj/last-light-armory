import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // Chromium only for now — this is an internal weapon database, not a
  // consumer surface with cross-browser exposure. Add firefox/webkit
  // projects here if that changes.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs against the production build per Next's own testing guide ("we
  // recommend running your tests against your production code"), not
  // `next dev`. CI runs `npm run build` as its own step first; locally,
  // reuseExistingServer means `npm run dev`/`next start` left running on
  // this port is picked up as-is instead of respawned.
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
