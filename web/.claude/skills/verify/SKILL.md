---
name: verify
description: Build, run, and drive the Next.js site in web/ to verify changes end-to-end.
---

# Verifying web/ (Next.js site)

There's a real, committed Playwright e2e suite now — prefer it over ad hoc
scripts:

```
npm run build
npm run test:e2e            # add --headed / --debug locally as needed
npx playwright show-report  # after a run, to inspect traces/screenshots
```

`e2e/**/*.spec.ts` already covers: home page load/search/filters/reset,
mobile viewport, search-to-click navigation into a weapon, direct
navigation to a multi-column weapon, 404 for an unknown hash, the perk
pool duplicate-name regression, the rolls table (with real null-score
placeholders), and the zero-rolls edge case. Extend these files for new
flows rather than writing one-off scratchpad scripts — they're
CI-enforced (`e2e` job in `.github/workflows/web-ci.yml`) and will catch
regressions on every PR, which throwaway scripts never will.

If you need something the suite doesn't cover yet (still useful for a
quick one-off check before deciding whether it's worth a permanent spec):

- `curl http://localhost:PORT/` — SSR HTML includes every weapon row
  (count `weapon-row` occurrences) plus the header counts. Gotcha: JSX
  interpolation inserts `<!-- -->` between text nodes — strip those before
  substring checks, or just use Playwright's `getByText` instead.
- No system Chrome on this box, but Playwright's own chromium (installed
  via `npx playwright install chromium`) lives at
  `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` — the e2e
  suite finds it automatically; only relevant if scripting outside
  `@playwright/test`.
- Next.js client-side navigation (`next/link`) is a soft nav — the
  browser's `load` event doesn't refire. Use `page.waitForURL(...)`, not
  `page.waitForLoadState('load')`, after a `.click()` that navigates.
- Filter bar handles: search input placeholder "Search weapons…", selects
  have aria-labels (Weapon type / Slot / Element / Tier), the result count
  lives in `span.ml-auto`, empty state text is "No weapons match".
- Weapon icons load remote from www.bungie.net (intentionally unoptimized) —
  prove they render with `naturalWidth > 0`, not just a 200 on the page.
- `playwright.config.ts` runs against the production build on port 3200
  (`webServer` auto-starts `next start -p 3200`); `reuseExistingServer` is
  true locally (off in CI) so a server you already have running there is
  reused as-is.
