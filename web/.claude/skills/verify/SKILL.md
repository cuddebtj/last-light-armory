---
name: verify
description: Build, run, and drive the Next.js site in web/ to verify changes end-to-end.
---

# Verifying web/ (Next.js site)

Build + serve:

- `cd web && npm run build` — Turbopack, a few seconds; `/` must show as `○ (Static)`.
- `npx next start -p 3100` in the background.

Drive:

- `curl http://localhost:3100/` — SSR HTML includes every weapon row
  (count `weapon-row` occurrences) plus the header counts. Gotcha: JSX
  interpolation inserts `<!-- -->` between text nodes — strip those before
  substring checks.
- Headless browser: no system Chrome on this box, but Playwright's chromium
  is cached at `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`.
  `npm i playwright-core` in the scratchpad and launch with `executablePath`
  pointed at that binary.
- Filter bar handles: search input placeholder "Search weapons…", selects
  have aria-labels (Weapon type / Slot / Element / Tier), the result count
  lives in `span.ml-auto`, empty state text is "No weapons match".

Gotchas:

- Weapon icons load remote from www.bungie.net (intentionally unoptimized) —
  prove they render with `img.complete && img.naturalWidth > 0`, not just a
  200 on the page.
