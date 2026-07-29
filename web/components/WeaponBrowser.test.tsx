import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import WeaponBrowser from "./WeaponBrowser";
import { makeScoringConfig, makeWeapon } from "@/test/fixtures";
import { logger } from "@/lib/logger";
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
    // pve/pvp deliberately ordered opposite each other (and both
    // different from Fatebringer's) so PvE-descending, PvP-descending,
    // and Overall-descending each produce a genuinely different order —
    // proving the three columns read independent fields, not the same
    // number three times.
    pve_score: 95,
    pvp_score: 40,
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
    pve_score: 70,
    pvp_score: 88,
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

// The new combobox (SearchableMultiSelect) replaced the old native <select>
// for weapon type and perk filters: type into the labeled text input to
// open its dropdown, then click the matching option button. Only one
// dropdown is expected open at a time, so a bare getByRole("listbox")
// unambiguously finds it.
async function pickOption(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.click(input);
  await user.type(input, value);
  await user.click(
    within(screen.getByRole("listbox")).getByRole("button", { name: value }),
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("WeaponBrowser", () => {
  it("renders every weapon with count, icons, frame, rpm, and PvE/PvP/Overall scores", () => {
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
    expect(screen.getByText("660")).toBeInTheDocument();
    // Fatebringer's three score columns are genuinely different values —
    // proves each column reads its own field, not one number repeated.
    expect(screen.getByText("70")).toBeInTheDocument(); // pve_score
    expect(screen.getByText("88")).toBeInTheDocument(); // pvp_score
    expect(screen.getByText("91.2")).toBeInTheDocument(); // overall_score

    // Cartesian Coordinate never had any of the three set — all three
    // cells in its row show the null placeholder.
    const cartesianRow = screen.getByText("Cartesian Coordinate").closest("a")!;
    expect(within(cartesianRow).getAllByText("—")).toHaveLength(3);
  });

  it("derives the type filter options from the data, sorted", async () => {
    const user = setup();
    await user.click(screen.getByLabelText("Weapon type"));
    const listbox = within(screen.getByRole("listbox"));
    expect(listbox.getAllByRole("button").map((b) => b.textContent)).toEqual([
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
    await pickOption(user, "Weapon type", "Hand Cannon");
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
    await pickOption(user, "Add a perk filter", "Explosive Payload");
    // Fatebringer and Cartesian Coordinate both have it (and, sharing
    // every other facet with Austringer, prove it's the perk pool doing
    // the narrowing here, not some other filter).
    expect(await screen.findByText("2 of 6")).toBeInTheDocument();
    expect(screen.getByText("Fatebringer")).toBeInTheDocument();
    expect(screen.getByText("Cartesian Coordinate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explosive Payload/ })).toBeInTheDocument();

    // A second perk only Fatebringer also has: narrows to just it — this
    // is an AND across selections, not an OR.
    await pickOption(user, "Add a perk filter", "Firefly");
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(screen.getByText("Fatebringer")).toBeInTheDocument();

    // A perk only Austringer has, on top of the above: no weapon can roll
    // all three -> empty state.
    await pickOption(user, "Add a perk filter", "Rangefinder");
    expect(await screen.findByText("0 of 6")).toBeInTheDocument();

    // Removing the contradictory chip restores the match.
    await user.click(screen.getByRole("button", { name: /Rangefinder/ }));
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
  });

  it("already-selected types and perks are not offered again in their own add-select", async () => {
    const user = setup();
    await pickOption(user, "Weapon type", "Hand Cannon");
    await user.click(screen.getByLabelText("Weapon type"));
    const listbox = within(screen.getByRole("listbox"));
    expect(
      listbox.queryByRole("button", { name: "Hand Cannon" }),
    ).not.toBeInTheDocument();
  });

  it("removes a selected weapon type via its chip", async () => {
    const user = setup();
    await pickOption(user, "Weapon type", "Hand Cannon");
    await pickOption(user, "Weapon type", "Sword");
    expect(await screen.findByText("3 of 6")).toBeInTheDocument(); // 2 Hand Cannons + 1 Sword

    await user.click(screen.getByRole("button", { name: /Sword/ }));
    expect(await screen.findByText("2 of 6")).toBeInTheDocument(); // Sword chip removed
  });

  it("narrows the perk dropdown as its own search input is typed into", async () => {
    const user = setup();
    const input = screen.getByPlaceholderText("Search perks…");
    await user.click(input);
    await user.type(input, "fire");
    const listbox = within(screen.getByRole("listbox"));
    expect(listbox.getAllByRole("button").map((b) => b.textContent)).toEqual([
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

  it("sorts by PvE Score descending by default, with nulls last in original order", () => {
    setup();
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;
    expect(renderedHashOrder()).toEqual([
      byName("Austringer"), // pve_score 95
      byName("Fatebringer"), // pve_score 70
      // Nulls last, tie order preserved (original array order).
      byName("Cartesian Coordinate"),
      byName("Gjallarhorn"),
      byName("Falling Guillotine"),
      byName("Future Weapon"),
    ]);
    expect(
      screen.getByRole("button", { name: "PvE Score, sorted descending" }),
    ).toBeInTheDocument();
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

  it("sorts numerically by PvE Score (weapon-level rank, the default) with nulls last", async () => {
    const user = setup();
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;

    // PvE Score is already the active default sort (descending).
    const initial = renderedHashOrder();
    expect(initial[0]).toBe(byName("Austringer")); // 95
    expect(initial[1]).toBe(byName("Fatebringer")); // 70

    await user.click(screen.getByRole("button", { name: "PvE Score, sorted descending" }));
    const asc = renderedHashOrder();
    expect(asc[0]).toBe(byName("Fatebringer")); // 70
    expect(asc[1]).toBe(byName("Austringer")); // 95
  });

  it("sorts numerically by PvP Score, independently of PvE Score", async () => {
    const user = setup();
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;

    // A fresh column starts ascending — Austringer's pvp_score (40) is
    // lower than Fatebringer's (88), the *opposite* order from PvE.
    await user.click(screen.getByRole("button", { name: "Sort by PvP Score" }));
    const order = renderedHashOrder();
    expect(order[0]).toBe(byName("Austringer")); // 40
    expect(order[1]).toBe(byName("Fatebringer")); // 88
  });

  it("sorts numerically by Overall Score, independently of PvE/PvP Score", async () => {
    const user = setup();
    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;

    await user.click(screen.getByRole("button", { name: "Sort by Overall Score" }));
    const order = renderedHashOrder();
    expect(order[0]).toBe(byName("Austringer")); // 75.5, ascending
    expect(order[1]).toBe(byName("Fatebringer")); // 91.2
  });

  it("PvE/PvP/Overall Score columns each reflect the combo score, not the weapon's own stored scores, once perks are selected", async () => {
    const user = setup();
    await pickOption(user, "Add a perk filter", "Explosive Payload");
    await pickOption(user, "Add a perk filter", "Firefly");
    // Only Fatebringer has both.
    expect(await screen.findByText("1 of 6")).toBeInTheDocument();
    expect(
      screen.getByText(/Scores reflect the best roll containing your selected perks/),
    ).toBeInTheDocument();

    // Combo score for exactly {Explosive Payload, Firefly} on a Hand
    // Cannon/Adaptive weapon with this fixture's archetype (90/30) and
    // weights (0.5 blend, columns 2/3 weight 0.3 each): pve 82.5, pvp
    // 27.5, overall 55 — genuinely different from Fatebringer's own
    // stored scores (70 / 88 / 91.2).
    expect(screen.getByText("82.5")).toBeInTheDocument();
    expect(screen.getByText("27.5")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.queryByText("70")).not.toBeInTheDocument();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(screen.queryByText("91.2")).not.toBeInTheDocument();
  });

  it("sorts by combo score (not the weapon's own stored score) once perks are selected, using each weapon's own archetype match", async () => {
    const user = setup();
    await pickOption(user, "Add a perk filter", "Explosive Payload");
    // Fatebringer (Hand Cannon, has an archetype match) and Cartesian
    // Coordinate (Fusion Rifle, no archetype match -> neutral base) both
    // qualify — same selected perk, genuinely different combo overall
    // scores (55 vs 50) because only one gets the archetype bonus.
    expect(await screen.findByText("2 of 6")).toBeInTheDocument();

    const byName = (n: string) => weapons.find((w) => w.name === n)!.hash;
    // A fresh column starts ascending — combo overall: Cartesian 50,
    // Fatebringer 55.
    await user.click(screen.getByRole("button", { name: "Sort by Overall Score" }));
    const asc = renderedHashOrder();
    expect(asc[0]).toBe(byName("Cartesian Coordinate")); // 50
    expect(asc[1]).toBe(byName("Fatebringer")); // 55

    await user.click(
      screen.getByRole("button", { name: "Overall Score, sorted ascending" }),
    );
    const desc = renderedHashOrder();
    expect(desc[0]).toBe(byName("Fatebringer")); // 55
    expect(desc[1]).toBe(byName("Cartesian Coordinate")); // 50
  });

  it("sorts alphabetically by weapon name", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sort by Weapon" }));
    expect(renderedHashOrder()[0]).toBe(
      weapons.find((w) => w.name === "Austringer")!.hash, // "A" sorts first
    );
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

    await user.click(screen.getByRole("button", { name: "Sort by PvP Score" }));
    const austringer = weapons.find((w) => w.name === "Austringer")!.hash;
    expect(renderedHashOrder()[0]).toBe(austringer); // pvp_score 40, lowest — ascending, not desc
    expect(
      screen.getByRole("button", { name: "PvP Score, sorted ascending" }),
    ).toBeInTheDocument();
  });

  it("shows Reset only when filters are active, and clears everything including perks", async () => {
    const user = setup();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search weapons…"), "zzzz");
    expect(await screen.findByText("0 of 6")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Slot"), "Energy");
    await pickOption(user, "Add a perk filter", "Firefly");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("6 of 6")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search weapons…")).toHaveValue("");
    expect(screen.getByLabelText("Slot")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: /Firefly/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("persists search, filters, and sort to sessionStorage, and restores them on remount", async () => {
    const user = setup();
    await user.type(screen.getByPlaceholderText("Search weapons…"), "Aust");
    await pickOption(user, "Weapon type", "Hand Cannon");
    await user.click(screen.getByRole("button", { name: "Sort by RPM" }));

    const stored = JSON.parse(
      window.sessionStorage.getItem("weapon-browser-state")!,
    );
    expect(stored.query).toBe("Aust");
    expect(stored.selectedTypes).toEqual(["Hand Cannon"]);
    expect(stored.sort).toEqual({ key: "rpm", dir: "asc" });

    // Simulate navigating to a weapon detail page (unmounts this
    // component) and hitting the browser back button (remounts it fresh)
    // — a plain useState would reset to defaults here without the
    // sessionStorage round trip.
    cleanup();
    render(
      <WeaponBrowser weapons={weapons} perks={perks} scoringConfig={scoringConfig} />,
    );
    expect(screen.getByPlaceholderText("Search weapons…")).toHaveValue("Aust");
    expect(screen.getByRole("button", { name: /Hand Cannon/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "RPM, sorted ascending" }),
    ).toBeInTheDocument();
  });

  it("logs a warning (without crashing) when sessionStorage.setItem throws", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    const user = setup();
    await user.type(screen.getByPlaceholderText("Search weapons…"), "Aust");

    expect(warnSpy).toHaveBeenCalledWith(
      "failed to persist session filters",
      expect.objectContaining({ error: expect.any(DOMException) }),
    );
    // The page itself keeps working — this is a "best effort" persistence
    // failure, not a crash.
    expect(screen.getByPlaceholderText("Search weapons…")).toHaveValue("Aust");

    setItemSpy.mockRestore();
  });

  it("falls back to defaults and logs a warning when sessionStorage holds corrupt JSON", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    window.sessionStorage.setItem("weapon-browser-state", "{not json");
    setup();
    expect(screen.getByPlaceholderText("Search weapons…")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "PvE Score, sorted descending" }),
    ).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      "failed to restore session filters, using defaults",
      expect.objectContaining({ error: expect.any(SyntaxError) }),
    );
    warnSpy.mockRestore();
  });

  it.each([
    ["an unrecognized sort key", { key: "bogus", dir: "sideways" }],
    ["a recognized key but an invalid direction", { key: "rpm", dir: "sideways" }],
    ["no sort field at all", undefined],
  ])("falls back to the default sort when stored sort data has %s", (_label, sort) => {
    window.sessionStorage.setItem(
      "weapon-browser-state",
      JSON.stringify({ sort }),
    );
    setup();
    expect(
      screen.getByRole("button", { name: "PvE Score, sorted descending" }),
    ).toBeInTheDocument();
  });
});
