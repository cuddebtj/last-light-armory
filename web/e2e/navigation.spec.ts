import { test, expect } from "@playwright/test";

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

test("visiting a weapon detail page directly (no client-side nav) renders its content", async ({ page }) => {
  // "Timelines' Vertex" — 3 perk columns, exercises the multi-column layout.
  await page.goto("/weapons/1006783454");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timelines' Vertex");
  await expect(page.getByText("Column 1")).toBeVisible();
  await expect(page.getByText("Column 2")).toBeVisible();
  await expect(page.getByText("Column 3")).toBeVisible();
});

test("an unknown weapon hash renders the themed 404, not a crash", async ({ page }) => {
  const response = await page.goto("/weapons/1");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not Found" })).toBeVisible();
  await expect(page.getByRole("link", { name: /All Weapons/ })).toHaveAttribute("href", "/");
});
