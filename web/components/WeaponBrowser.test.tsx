import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeaponBrowser, {
  compareNullableNumber,
} from "./WeaponBrowser";
import { makeScoringConfig, makeWeapon } from "@/test/fixtures";
import type { Perk, WeaponIndexEntry } from "@/lib/types";

vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: function MockImage(props: Record<string, unknown>) {
      return createElement("img", props);
    },
  };
});

const perks: Perk[] = [
  { hash: 1, name: "Explosive Payload", enhanced: false, icon: "/icons/ep.jpg", pve_score: 100, pvp_score: 0 },
  { hash: 2, name: "Firefly", enhanced: false, icon: "/icons/firefly.jpg", pve_score: null, pvp_score: null },
  { hash: 3, name: "Rangefinder", enhanced: false, icon: "/icons/rf.jpg", pve_score: null, pvp_score: null },
];

const weapons: WeaponIndexEntry[] = [
  makeWeapon({
    name: "Austringer",
    type: "Hand Cannon",
    slot: "Kinetic",
    element: "Kinetic",
    tier: "Legendary",
    rpm: 140,
    ammo_type: "Primary",
    columns: [{ index: 2, perks: [3] }], // Rangefinder
    overall_score: 75.5,
  }),
  makeWeapon({
    name: "Fatebringer",
    type: "Hand Cannon",
    slot: "Kinetic",
    element: "Arc",
    tier: "Legendary",
    rpm: 140,
    ammo_type: "Primary",
    columns: [
      { index: 2, perks: [1] }, // Explosive Payload
      { index: 3, perks: [2] }, // Firefly
    ],
    overall_score: 91.2,
  }),
  makeWeapon({
    name: "Cartesian Coordinate",
    type: "Fusion Rifle",
    slot: "Energy",
    element: "Solar",
    tier: "Legendary",
    rpm: 660,
    ammo_type: "Special",
    columns: [{ index: 2, perks: [1] }], // Explosive Payload — no archetype_scores match for Fusion Rifle
  }),
  makeWeapon({
    name: "Gjallarhorn",
    type: "Rocket Launcher",
    slot: "Power",
    element: "Solar",
    tier: "Exotic",
    rpm: 15,
    roll_count: 1,
    ammo_type: "Heavy",
    breaker_type: "Shield Piercing",
    frame: "Wolfpack Rounds",
  }),
  makeWeapon({ name: "Falling Guillotine", type: "Sword", slot: "Power", element: "Void", tier: "Legendary", rpm: null, ammo_type: "Special" }),
  // Unknown element/tier exercise the styling fallbacks; a second null rpm
  // (alongside Falling Guillotine's) exercises the both-null tie branch.
  makeWeapon({
    name: "Future Weapon",
    type: "Glaive",
    element: "Prismatic",
    tier: "Mythic",
    rpm: null,
  } as unknown as Partial<WeaponIndexEntry>),
];

const scoringConfig = makeScoringConfig({
  // Deliberately not averaging to the neutral 50 midpoint (unlike a
  // symmetric 80/20 pair, which would coincidentally produce the same
  // combo score whether or not the archetype match applies at all) — see
  // the combo-score tests below, which rely on Hand Cannon and Fusion
  // Rifle producing genuinely different scores for the same selected perk.
  archetype_scores: [
    { weapon_type: "Hand Cannon", frame: "Adaptive", pve_score: 90, pvp_score: 30 },
  ],
});

function setup() {
  const user = userEvent.setup();
  render(
    <WeaponBrowser weapons={weapons} perks={perks} scoringConfig={scoringConfig} />,
  );
  return user;
}

function renderedHashOrder(): number[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href?.startsWith("/weapons/"))
    .map((href) => Number(href.replace("/weapons/", "")));
}

describe("compareNullableNumber", () => {
  it("covers every null combination directly, since Array.sort's own comparison pattern isn't guaranteed to exercise all four", () => {
    expect(compareNullableNumber(null, null, 1)).toBe(0);
    expect(compareNullableNumber(null, 5, 1)).toBe(1); // a null -> sorts after
    expect(compareNullableNumber(5, null, 1)).toBe(-1); // b null -> sorts after
    expect(compareNullableNumber(10, 5, 1)).toBe(5); // ascending
    expect(compareNullableNumber(10, 5, -1)).toBe(-5); // descending
  });
});

describe("WeaponBrowser", () => {
  it("renders every weapon with count, icons, frame, rpm, score, and roll count", () => {
    setup();
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
    expect(screen.getByText("Austringer")).toBeInTheDocument();
    expect(screen.getByText("Falling Guillotine")).toBeInTheDocument();

    const icon = screen.getByAltText("Austringer");
    expect(icon).toHaveAttribute(
      "src",
      "https://www.bungie.net/common/destiny2_content/icons/test-icon.jpg",
    );
    expect(screen.getAllByText("Adaptive Frame").length).toBeGreaterThan(0);
    // Two null-rpm weapons plus four null-overall_score weapons ("—" is
    // shared by both columns).
    expect(screen.getAllByText("—").length).toBe(6);
    expect(screen.getByText("660")).toBeInTheDocument();
    expect(screen.getByText("91.2")).toBeInTheDocument();
  });

  it("derives the type filter options from the data, sorted", () => {
    setup();
    const options = screen
      .getByLabelText("Weapon type")
      .querySelectorAll("option");
    expect([...options].map((o) => o.textContent)).toEqual([
      "Add weapon type…",
      "Fusion Rifle",
      "Glaive",
      "Hand Cannon",
      "Rocket Launcher",
      "Sword",
    ]);
  });

  it("colors elements and falls back for unknown element/tier", () => {
    setup();
    const list = within(screen.getByRole("list"));
    expect(list.getByText("Arc")).toHaveClass("text-arc");
    expect(list.getByText("Void")).toHaveClass("text-void");
    expect(list.getByText("Prismatic")).toHaveClass("text-muted");

    const exoticIcon = screen.getByAltText("Gjallarhorn").parentElement;
    expect(exoticIcon).toHaveClass("border-exotic");
    const unknownTierIcon = screen.getByAltText("Future Weapon").parentElement;
    expect(unknownTierIcon).toHaveClass("border-edge");
  });

  it("filters by name search, case-insensitively", async () => {
    const user = setup();
    await user.type(screen.getByPlaceholderText("Search weapons…"), "FATE");
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Fatebringer")).toBeInTheDocument();
    expect(screen.queryByText("Austringer")).not.toBeInTheDocument();
  });

  it("combines type, slot, element, and tier filters", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Weapon type"), "Hand Cannon");
    expect(await screen.findByText("2 of 6")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Element"), "Arc");
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Fatebringer")).toBeInTheDocument();

    // Contradictory slot on top of the element filter → empty state.
    await user.selectOptions(screen.getByLabelText("Slot"), "Power");
    expect(await screen.findByText("0 of 6")).toBeInTheDocument();
    expect(
      screen.getByText("No weapons match these filters."),
    ).toBeInTheDocument();
  });

  it("filters by tier", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Tier"), "Exotic");
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Gjallarhorn")).toBeInTheDocument();
  });

  it("filters by frame, a finer facet than weapon type", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Frame"), "Wolfpack Rounds");
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Gjallarhorn")).toBeInTheDocument();
  });

  it("filters by ammo type — slot is not a valid proxy", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Ammo type"), "Special");
    expect(await screen.findByText("2 of 6")).toBeInTheDocument();
    expect(screen.getByText("Cartesian Coordinate")).toBeInTheDocument();
    expect(screen.getByText("Falling Guillotine")).toBeInTheDocument();
  });

  it("filters by champion mod (intrinsic breaker type)", async () => {
    const user = setup();
    await user.selectOptions(
      screen.getByLabelText("Champion mod"),
      "Shield Piercing",
    );
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Gjallarhorn")).toBeInTheDocument();
  });

  it("filters to weapons that can roll a chosen perk, narrowing further as more are added", async () => {
    const user = setup();
    await user.selectOptions(
      screen.getByLabelText("Add a perk filter"),
      "Explosive Payload",
    );
    // Fatebringer and Cartesian Coordinate both have it (and, sharing
    // every other facet with Austringer, prove it's the perk pool doing
    // the narrowing here, not some other filter).
    expect(await screen.findByText("2 of 6")).toBeInTheDocument();
    expect(screen.getByText("Fatebringer")).toBeInTheDocument();
    expect(screen.getByText("Cartesian Coordinate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explosive Payload/ })).toBeInTheDocument();

    // A second perk only Fatebringer also has: narrows to just it — this
    // is an AND across selections, not an OR.
    await user.selectOptions(screen.getByLabelText("Add a perk filter"), "Firefly");
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Fatebringer")).toBeInTheDocument();

    // A perk only Austringer has, on top of the above: no weapon can roll
    // all three -> empty state.
    await user.selectOptions(screen.getByLabelText("Add a perk filter"), "Rangefinder");
    expect(await screen.findByText("0 of 6")).toBeInTheDocument();

    // Removing the contradictory chip restores the match.
    await user.click(screen.getByRole("button", { name: /Rangefinder/ }));
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
  });

  it("already-selected types and perks are not offered again in their own add-select", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Weapon type"), "Hand Cannon");
    const typeOptions = screen
      .getByLabelText("Weapon type")
      .querySelectorAll("option");
    expect([...typeOptions].map((o) => o.textContent)).not.toContain(
      "Hand Cannon",
    );
  });

  it("removes a selected weapon type via its chip", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Weapon type"), "Hand Cannon");
    await user.selectOptions(screen.getByLabelText("Weapon type"), "Sword");
    expect(await screen.findByText("3 of 6")).toBeInTheDocument(); // 2 Hand Cannons + 1 Sword

    await user.click(screen.getByRole("button", { name: /Sword/ }));
    expect(await screen.findByText("2 of 6")).toBeInTheDocument(); // Sword chip removed
  });

  it("narrows the perk add-select's options as the perk search box is typed into", async () => {
    const user = setup();
    await user.type(screen.getByPlaceholderText("Search perks…"), "fire");
    const options = screen
      .getByLabelText("Add a perk filter")
      .querySelectorAll("option");
    expect([...options].map((o) => o.textContent)).toEqual([
      "Add perk…",
      "Firefly",
    ]);
  });

  it("links each row to its weapon detail page", () => {
    setup();
    expect(screen.getByRole("link", { name: /Austringer/ })).toHaveAttribute(
      "href",
      `/weapons/${weapons[0].hash}`,
    );
  });

  it("sorts by name ascending by default, regardless of input order", () => {
    setup();
    const expected = [...weapons]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => w.hash);
    expect(renderedHashOrder()).toEqual(expected);
  });

  it("sorts numerically by RPM with nulls last in both directions, and toggles on repeat clicks", async () => {
    const user = setup();
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;

    await user.click(screen.getByRole("button", { name: "Sort by RPM" }));
    expect(renderedHashOrder()).toEqual([
      byName("Gjallarhorn"), // 15
      byName("Austringer"), // 140 (tie, original order)
      byName("Fatebringer"), // 140
      byName("Cartesian Coordinate"), // 660
      // Both null — last even ascending, tie order preserved (both-null branch).
      byName("Falling Guillotine"),
      byName("Future Weapon"),
    ]);

    await user.click(screen.getByRole("button", { name: "RPM, sorted ascending" }));
    expect(renderedHashOrder()).toEqual([
      byName("Cartesian Coordinate"), // 660
      byName("Austringer"), // 140 (tie, original order preserved)
      byName("Fatebringer"),
      byName("Gjallarhorn"), // 15
      // Still last, not first, when descending — and still in original tie order.
      byName("Falling Guillotine"),
      byName("Future Weapon"),
    ]);

    // A third click (desc -> asc) exercises the toggle-back branch.
    await user.click(screen.getByRole("button", { name: "RPM, sorted descending" }));
    expect(
      screen.getByRole("button", { name: "RPM, sorted ascending" }),
    ).toBeInTheDocument();
    expect(renderedHashOrder()[0]).toBe(byName("Gjallarhorn"));
  });

  it("sorts numerically by Score (weapon-level rank) with nulls last", async () => {
    const user = setup();
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;

    await user.click(screen.getByRole("button", { name: "Sort by Score" }));
    // Ascending: lowest real score first (Austringer 75.5, then Fatebringer
    // 91.2), the four null-score weapons trail in original order.
    const order = renderedHashOrder();
    expect(order[0]).toBe(byName("Austringer"));
    expect(order[1]).toBe(byName("Fatebringer"));

    await user.click(screen.getByRole("button", { name: "Score, sorted ascending" }));
    // Descending: highest real score first, nulls still last.
    const desc = renderedHashOrder();
    expect(desc[0]).toBe(byName("Fatebringer"));
    expect(desc[1]).toBe(byName("Austringer"));
  });

  it("Score column reflects the combo score, not the weapon's overall_score, once perks are selected", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Add a perk filter"), "Explosive Payload");
    await user.selectOptions(screen.getByLabelText("Add a perk filter"), "Firefly");
    // Only Fatebringer has both.
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(
      screen.getByText(/Score reflects the best roll containing your selected perks/),
    ).toBeInTheDocument();

    // Combo score for exactly {Explosive Payload, Firefly} on a Hand
    // Cannon/Adaptive weapon with this fixture's archetype (90/30) and
    // weights (0.5 blend, columns 2/3 weight 0.3 each): 55 — genuinely
    // different from Fatebringer's own overall_score fixture value (91.2).
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.queryByText("91.2")).not.toBeInTheDocument();
  });

  it("sorts by combo score (not weapon overall_score) once perks are selected, using each weapon's own archetype match", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Add a perk filter"), "Explosive Payload");
    // Fatebringer (Hand Cannon, has an archetype match) and Cartesian
    // Coordinate (Fusion Rifle, no archetype match -> neutral base) both
    // qualify — same selected perk, genuinely different combo scores
    // (55 vs 50) because only one gets the archetype bonus.
    expect(await screen.findByText("2 of 6")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort by Score" }));
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;
    const order = renderedHashOrder();
    expect(order[0]).toBe(byName("Cartesian Coordinate")); // 50, ascending
    expect(order[1]).toBe(byName("Fatebringer")); // 55

    await user.click(screen.getByRole("button", { name: "Score, sorted ascending" }));
    const desc = renderedHashOrder();
    expect(desc[0]).toBe(byName("Fatebringer")); // 55, descending
    expect(desc[1]).toBe(byName("Cartesian Coordinate")); // 50
  });

  it("sorts alphabetically by type and by element", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Sort by Type" }));
    expect(renderedHashOrder()[0]).toBe(
      weapons.find((w) => w.type === "Fusion Rifle")!.hash, // "F" < "Glaive"/"Hand Cannon"/...
    );

    await user.click(screen.getByRole("button", { name: "Sort by Element" }));
    expect(renderedHashOrder()[0]).toBe(
      weapons.find((w) => w.element === "Arc")!.hash, // "Arc" sorts before Kinetic/Prismatic/Solar/Void
    );
  });

  it("switching to a different column starts that column at ascending", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sort by RPM" }));
    await user.click(screen.getByRole("button", { name: "RPM, sorted ascending" })); // now RPM desc

    await user.click(screen.getByRole("button", { name: "Sort by Rolls" }));
    const gjallarhorn = weapons.find((w) => w.name === "Gjallarhorn")!.hash;
    expect(renderedHashOrder()[0]).toBe(gjallarhorn); // roll_count 1, lowest — ascending, not desc
    expect(
      screen.getByRole("button", { name: "Rolls, sorted ascending" }),
    ).toBeInTheDocument();
  });

  it("shows Reset only when filters are active, and clears everything including perks", async () => {
    const user = setup();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search weapons…"), "zzzz");
    expect(await screen.findByText("0 of 6")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Slot"), "Energy");
    await user.selectOptions(
      screen.getByLabelText("Add a perk filter"),
      "Firefly",
    );

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("6 of 6")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search weapons…")).toHaveValue("");
    expect(screen.getByLabelText("Slot")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: /Firefly/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });
});
