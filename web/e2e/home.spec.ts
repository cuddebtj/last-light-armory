import { test, expect } from "@playwright/test";

const COUNT = /^[\d,]+ of [\d,]+$/;

test.describe("home page", () => {
  test("loads the full weapon list and shows manifest stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Last Light Armory" })).toBeVisible();
    await expect(page.getByText(/[\d,]+ weapons · [\d,]+ rolls · manifest updated/)).toBeVisible();
    await expect(page.getByText(COUNT)).toBeVisible();
  });

  test("filters by name search", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Search weapons…").fill("austringer");
    // Couples to the committed export snapshot (web/data/), same as
    // lib/data.test.ts — "Austringer" matches its base and Adept variants.
    await expect(page.getByText(COUNT)).toHaveText("2 of 2,208");
    await expect(page.getByRole("link", { name: /Austringer/i }).first()).toBeVisible();
  });

  test("combines type/slot/element/tier filters down to an empty state", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Weapon type", { exact: true }).selectOption("Hand Cannon");
    await page.getByLabel("Element", { exact: true }).selectOption("Void");
    const someMatches = await page.getByText(COUNT).textContent();
    expect(someMatches).not.toMatch(/^0 of/);

    // No Hand Cannon is a Power-slot weapon — a real, guaranteed-empty combination.
    await page.getByLabel("Slot", { exact: true }).selectOption("Power");
    await expect(page.getByText(COUNT)).toHaveText("0 of 2,208");
    await expect(page.getByText("No weapons match these filters.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("reset clears search, filters, and restores the full list", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Search weapons…").fill("zzzzqqq");
    await page.getByLabel("Tier", { exact: true }).selectOption("Exotic");
    await expect(page.getByText("No weapons match these filters.")).toBeVisible();

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByPlaceholder("Search weapons…")).toHaveValue("");
    await expect(page.getByLabel("Tier", { exact: true })).toHaveValue("");
    await expect(page.getByText(COUNT)).toHaveText("2,208 of 2,208");
  });

  test("click-to-sort reorders the list by name and by RPM", async ({ page }) => {
    await page.goto("/");
    const firstRowName = () => page.getByRole("link").first().locator("span.font-medium");

    // Default sort is name-ascending.
    await expect(firstRowName()).toHaveText("1000 Yard Stare");

    // Weapon is already the active (default) column — its accessible
    // name reflects that, so one click flips straight to descending.
    await page.getByRole("button", { name: "Weapon, sorted ascending" }).click();
    await expect(firstRowName()).toHaveText("Zephyr");

    // Crown-Splitter (rpm 0) and Leviathan's Breath (rpm 1328) are the
    // real min/max RPM in the current export — couples to that snapshot,
    // same as other data-specific e2e assertions.
    await page.getByRole("button", { name: "Sort by RPM" }).click();
    await expect(firstRowName()).toHaveText("Crown-Splitter");
    await page.getByRole("button", { name: "RPM, sorted ascending" }).click();
    await expect(firstRowName()).toHaveText("Leviathan's Breath");
  });

  test("answers a real loadout query: Solar, Energy, Primary ammo, Heal Clip + Incandescent, Auto Rifle or SMG", async ({ page }) => {
    // The exact target query CLAUDE.md's advanced-filtering direction
    // describes, run against the real committed export (not a fixture) —
    // "The Summoner" is a genuine, well-known match for this combination.
    await page.goto("/");
    await page.getByLabel("Element", { exact: true }).selectOption("Solar");
    await page.getByLabel("Slot", { exact: true }).selectOption("Energy");
    await page.getByLabel("Ammo type", { exact: true }).selectOption("Primary");
    await page.getByLabel("Weapon type", { exact: true }).selectOption("Auto Rifle");
    await page.getByLabel("Weapon type", { exact: true }).selectOption("Submachine Gun");
    await page.getByLabel("Add a perk filter", { exact: true }).selectOption("Heal Clip");
    await page.getByLabel("Add a perk filter", { exact: true }).selectOption("Incandescent");

    const count = await page.getByText(COUNT).textContent();
    expect(count).not.toMatch(/^0 of/);
    await expect(page.getByRole("link", { name: /The Summoner/i }).first()).toBeVisible();
    // Fatebringer is a Kinetic-slot Hand Cannon — none of this query's
    // facets match it.
    await expect(page.getByRole("link", { name: /Fatebringer/i })).toHaveCount(0);
  });

  test("renders correctly on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByPlaceholder("Search weapons…")).toBeVisible();
    await expect(page.getByRole("link").first()).toBeVisible();
  });
});
