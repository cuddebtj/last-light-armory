import { test, expect } from "@playwright/test";

const COUNT = /^[\d,]+ of [\d,]+$/;

// Fatebringer is a well-known raid weapon, stable across manifest updates —
// low risk of disappearing from a future export the way a seasonal/vendor
// weapon might.
test("search, click through to a weapon's detail page, and back again", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Search weapons…").fill("Fatebringer");

  const link = page
    .getByRole("link")
    .filter({ has: page.getByText("Fatebringer", { exact: true }) })
    .first();
  await link.click();

  await expect(page).toHaveURL(/\/weapons\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fatebringer");
  await expect(page).toHaveTitle("Fatebringer — Last Light Armory");

  // The header icon is a real bungie.net asset, not a broken/placeholder src.
  const icon = page.getByAltText("Fatebringer", { exact: true });
  await expect(icon).toHaveAttribute("src", /^https:\/\/www\.bungie\.net\//);
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("link", { name: /All Weapons/ }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByPlaceholder("Search weapons…")).toBeVisible();
});

// Real reported bug: filtering/sorting, clicking into a weapon, then
// hitting the browser's back button used to lose all of it and land back
// on the unfiltered, default-sorted list — WeaponBrowser now persists its
// state to sessionStorage precisely so this round trip survives.
test("filters and sort survive a click-through to a weapon and back button navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Search weapons…").fill("Fatebringer");
  await page.getByRole("button", { name: "Sort by RPM" }).click();

  const link = page
    .getByRole("link")
    .filter({ has: page.getByText("Fatebringer", { exact: true }) })
    .first();
  await link.click();
  await expect(page).toHaveURL(/\/weapons\/\d+$/);

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByPlaceholder("Search weapons…")).toHaveValue("Fatebringer");
  await expect(
    page.getByRole("button", { name: "RPM, sorted ascending" }),
  ).toBeVisible();
  // Two real, distinct weapons both named exactly "Fatebringer" in the
  // current export — not "1 of 2,208". The point here isn't the exact
  // count, just that the filter genuinely persisted rather than resetting.
  await expect(page.getByText("4 of 2,208")).toBeVisible();
});

// Real reported bug: the sessionStorage persistence above (added for the
// back-button fix) originally read stored state synchronously during the
// client's very first render. That disagreed with the server-rendered
// HTML — which always encodes defaults, since sessionStorage doesn't
// exist during SSR — and tripped a React hydration error on every load
// where a prior session had left non-default state behind, after which
// every filter on the page appeared inert. addInitScript seeds
// sessionStorage before the page's own scripts run, simulating a real
// returning visitor rather than a same-tab reload.
test("a returning visitor with saved filters hits no hydration errors and can still filter", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.addInitScript(() => {
    sessionStorage.setItem(
      "weapon-browser-state",
      JSON.stringify({
        query: "",
        selectedTypes: [],
        slot: "Energy",
        element: "",
        tier: "",
        frame: "",
        ammoType: "",
        breakerType: "",
        selectedPerkNames: [],
        sort: { key: "overall_score", dir: "desc" },
      }),
    );
  });

  await page.goto("/");
  await expect(page.getByLabel("Slot", { exact: true })).toHaveValue("Energy");

  const beforeCount = await page.getByText(COUNT).textContent();
  await page.getByLabel("Tier", { exact: true }).selectOption("Exotic");
  await expect(page.getByText(COUNT)).not.toHaveText(beforeCount!);

  expect(pageErrors).toEqual([]);
});

test("visiting a weapon detail page directly (no client-side nav) renders its content", async ({ page }) => {
  // "Timelines' Vertex" — 3 perk columns (indices 0/1/2), exercises the
  // multi-column layout, labeled by real column semantics.
  await page.goto("/weapons/1006783454");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timelines' Vertex");
  await expect(page.getByText("Barrel", { exact: true })).toBeVisible();
  await expect(page.getByText("Magazine", { exact: true })).toBeVisible();
  await expect(page.getByText("Trait 1", { exact: true })).toBeVisible();
});

test("an unknown weapon hash renders the themed 404, not a crash", async ({ page }) => {
  const response = await page.goto("/weapons/1");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not Found" })).toBeVisible();
  await expect(page.getByRole("link", { name: /All Weapons/ })).toHaveAttribute("href", "/");
});
