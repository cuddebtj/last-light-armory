import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // lib/data.ts imports the "server-only" poison pill, which throws
      // outside a React Server Components bundler.
      "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // e2e/**/*.spec.ts are Playwright specs — they use @playwright/test's
    // own `test`/fixtures (like `page`), not Vitest's, and must only run
    // via `playwright test`. Vitest's default include glob would
    // otherwise collect them too, since it also matches *.spec.ts.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Date formatting in page.tsx must not depend on the machine's timezone.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
      thresholds: {
        statements: 98,
        branches: 98,
        functions: 98,
        lines: 98,
      },
    },
  },
});
