import { test, expect } from "@playwright/test";

// Fatebringer (hash 2171478765): Destiny 2's manifest defines some barrel
// perks under multiple hashes with an identical name — this weapon's
// column 1 is a known real-world case. Regression coverage for the
// dedupeByName fix in lib/perks.ts (unit-tested in isolation, but this
// proves it holds against actual production data end to end).
test("perk pool shows no duplicate perk names despite duplicate-hash entries, labeled by real column semantics", async ({ page }) => {
  await page.goto("/weapons/2171478765");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fatebringer");

  const perkPool = page.getByText("Perk Pool").locator("xpath=..");
  await expect(perkPool.getByText("Full Bore", { exact: true })).toHaveCount(1);
  // weapon_perk.column_index 0/1 -> Barrel/Magazine, not raw "Column 1/2".
  // exact: true — several real perk names (e.g. "Fluted Barrel") would
  // otherwise substring-match the column label itself.
  await expect(perkPool.getByText("Barrel", { exact: true })).toBeVisible();
  await expect(perkPool.getByText("Magazine", { exact: true })).toBeVisible();

  // Real weapon-level scores from the committed export, in the new
  // sidebar — our own differentiator vs. a popularity-only view.
  const weaponScore = page.getByText("Weapon Score").locator("xpath=..");
  await expect(weaponScore.getByText("42.83", { exact: true })).toBeVisible();
  await expect(weaponScore.getByText("45.31", { exact: true })).toBeVisible();
  await expect(weaponScore.getByText("40.36", { exact: true })).toBeVisible();
});

// Malfeasance (hash 204878059): a real weapon with a non-null
// breaker_type in the current export — exercises the Details sidebar's
// conditional "Has X properties" bullet against real data, not a fixture.
test("Details sidebar shows real breaker-type, ammo, and element facts", async ({ page }) => {
  await page.goto("/weapons/204878059");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Malfeasance");

  const details = page.getByText("Details").locator("xpath=..");
  await expect(details.getByText("Has Stagger properties")).toBeVisible();
  await expect(details.getByText("Uses Primary ammo")).toBeVisible();
  await expect(details.getByText("Kinetic weapon")).toBeVisible();
});

test("renders the curated rolls table with perks and real scores", async ({ page }) => {
  // Timelines' Vertex (hash 1006783454) has exactly one recorded roll.
  // Its scores used to be null placeholders before the scoring job
  // (Milestones 6-10) existed; it's now scored like every other roll, so
  // this asserts real values from the current export rather than "—".
  await page.goto("/weapons/1006783454");
  await expect(page.getByRole("heading", { name: "Rolls (1)" })).toBeVisible();

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "PvE" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "PvP" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Overall" })).toBeVisible();

  const firstDataRow = table.getByRole("row").nth(1);
  await expect(firstDataRow.getByText("51.09", { exact: true })).toBeVisible();
  await expect(firstDataRow.getByText("50", { exact: true })).toBeVisible();
  await expect(firstDataRow.getByText("50.55", { exact: true })).toBeVisible();
});

// Traveler's Chosen has no recorded rolls in the current export — a real
// example of the 58 zero-roll weapons in the dataset, exercising the
// empty-rolls branch against actual on-disk JSON rather than a fixture.
test("a weapon with no recorded rolls shows the placeholder, not an empty table", async ({ page }) => {
  await page.goto("/weapons/53159280");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Traveler's Chosen");
  await expect(
    page.getByText("No curated rolls recorded for this weapon yet."),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
