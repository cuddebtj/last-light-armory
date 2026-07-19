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
    await page.getByLabel("Weapon type").selectOption("Hand Cannon");
    await page.getByLabel("Element").selectOption("Void");
    const someMatches = await page.getByText(COUNT).textContent();
    expect(someMatches).not.toMatch(/^0 of/);

    // No Hand Cannon is a Power-slot weapon — a real, guaranteed-empty combination.
    await page.getByLabel("Slot").selectOption("Power");
    await expect(page.getByText(COUNT)).toHaveText("0 of 2,208");
    await expect(page.getByText("No weapons match these filters.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("reset clears search, filters, and restores the full list", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Search weapons…").fill("zzzzqqq");
    await page.getByLabel("Tier").selectOption("Exotic");
    await expect(page.getByText("No weapons match these filters.")).toBeVisible();

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByPlaceholder("Search weapons…")).toHaveValue("");
    await expect(page.getByLabel("Tier")).toHaveValue("");
    await expect(page.getByText(COUNT)).toHaveText("2,208 of 2,208");
  });

  test("renders correctly on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByPlaceholder("Search weapons…")).toBeVisible();
    await expect(page.getByRole("link").first()).toBeVisible();
  });
});
