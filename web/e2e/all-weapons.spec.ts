import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

interface IndexEntry {
  hash: number;
  name: string;
}

// Playwright runs from web/ (same as lib/data.ts's DATA_DIR resolution).
const weapons: IndexEntry[] = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/weapons/index.json"),
    "utf-8",
  ),
);

// Matches React's DOM text-escaping so we can assert the exact rendered
// name shows up in the response body, regardless of apostrophes/quotes/
// ampersands in the weapon's name (e.g. "Timelines' Vertex").
function reactEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Every one of the ~2,208 statically generated weapon detail pages, hit as
// real HTTP requests against the running production server (real e2e: the
// actual server, the actual served bytes) rather than full browser
// rendering. Deliberate tradeoff: app/weapons/[hash]/page.tsx is a pure
// Server Component with no client-side behavior beyond next/image, so an
// HTTP check already proves what page.goto() would for this route shape —
// that the specific weapon's own content is actually served at its own
// URL, not a routing/caching mixup — at a fraction of the cost. Full
// browser rendering (hydration, real navigation, real asset loading) is
// covered for a representative sample in weapon-detail.spec.ts and
// navigation.spec.ts instead of re-paying that cost 2,208 times.
//
// Batched so Playwright's own worker parallelism spreads the sweep across
// CPUs instead of one long serial test; expect.soft so one bad weapon
// doesn't hide failures in the rest of its batch.
test.describe("every weapon detail page returns its own content (smoke)", () => {
  const BATCH_SIZE = 150;
  const batches: IndexEntry[][] = [];
  for (let i = 0; i < weapons.length; i += BATCH_SIZE) {
    batches.push(weapons.slice(i, i + BATCH_SIZE));
  }

  batches.forEach((batch, i) => {
    test(`batch ${i + 1}/${batches.length} (${batch.length} weapons)`, async ({
      request,
    }) => {
      for (const w of batch) {
        const res = await request.get(`/weapons/${w.hash}`);
        expect
          .soft(res.status(), `${w.name} (${w.hash}) should return 200`)
          .toBe(200);

        const body = await res.text();
        expect
          .soft(
            body,
            `${w.name} (${w.hash}) should render its own name, not a 404 or a different weapon`,
          )
          .toContain(reactEscape(w.name));
      }
    });
  });
});

test("home page and an unknown hash behave as expected at the HTTP level", async ({
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);

  const missing = await request.get("/weapons/1");
  expect(missing.status()).toBe(404);
});
