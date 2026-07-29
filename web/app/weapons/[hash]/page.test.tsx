import { render, screen, within } from "@testing-library/react";
import WeaponPage, {
  generateMetadata,
  generateStaticParams,
} from "./page";
import { getPerks, getWeaponOrNull } from "@/lib/data";
import { makeWeapon } from "@/test/fixtures";
import type { WeaponDetail } from "@/lib/types";

vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: function MockImage(props: Record<string, unknown>) {
      return createElement("img", props);
    },
  };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...actual,
    getWeaponOrNull: vi.fn(),
    getPerks: vi.fn(),
  };
});

const perks = [
  { hash: 1, name: "Rewind Rounds", enhanced: false, icon: "/icons/a.png", pve_score: null, pvp_score: null },
  { hash: 2, name: "Feeding Frenzy", enhanced: true, icon: "/icons/b.png", pve_score: null, pvp_score: null },
  { hash: 3, name: "Zen Moment", enhanced: false, icon: "/icons/c.png", pve_score: null, pvp_score: null },
  { hash: 4, name: "Feeding Frenzy", enhanced: false, icon: "/icons/d.png", pve_score: null, pvp_score: null },
];

function fullWeapon(overrides: Partial<WeaponDetail> = {}): WeaponDetail {
  return {
    ...makeWeapon({
      name: "Fatebringer",
      craftable: true,
      enhanceable: true,
      obtainable: false,
    }),
    source: "Source: Complete the Vault of Glass raid.",
    columns: [
      { index: 0, perks: [1, 2, 4] },
      { index: 1, perks: [3] },
    ],
    rolls: [
      {
        key: "a",
        perks: [
          { column: 1, hash: 3 },
          { column: 0, hash: 1 },
        ],
        pve_score: 95.5,
        pvp_score: 88,
        overall_score: 91.2,
      },
      {
        key: "b",
        perks: [{ column: 0, hash: 2 }],
        pve_score: null,
        pvp_score: null,
        overall_score: null,
      },
    ],
    ...overrides,
  };
}

async function renderPage() {
  const ui = await WeaponPage({ params: Promise.resolve({ hash: "123" }) });
  render(ui);
}

describe("WeaponPage", () => {
  beforeEach(() => {
    vi.mocked(getPerks).mockResolvedValue(perks);
  });

  it("renders header, tier, badges, source, perk pool, and rolls", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(fullWeapon());
    await renderPage();

    expect(screen.getByRole("heading", { name: "Fatebringer" })).toBeInTheDocument();
    expect(screen.getByText("Legendary")).toBeInTheDocument();
    expect(screen.getByText(/Hand Cannon · Adaptive Frame/)).toBeInTheDocument();
    expect(screen.getByText("Craftable")).toBeInTheDocument();
    expect(screen.getByText("Enhanceable")).toBeInTheDocument();
    expect(screen.getByText("Currently unobtainable")).toBeInTheDocument();
    expect(
      screen.getByText("Source: Complete the Vault of Glass raid."),
    ).toBeInTheDocument();

    const perkPool = within(screen.getByText("Perk Pool").closest("section")!);
    // Column index -> semantic label, the fixed weapon_perk.column_index
    // convention (0 barrel, 1 magazine, ...) — not raw "Column N".
    expect(perkPool.getByText("Barrel")).toBeInTheDocument();
    expect(perkPool.getByText("Magazine")).toBeInTheDocument();
    // Column 0 has two hashes named "Feeding Frenzy" (a real Destiny 2
    // manifest quirk) — the pool dedupes to one visible entry.
    expect(perkPool.getAllByText("Feeding Frenzy")).toHaveLength(1);

    const detailsEl = screen.getByText("Details").closest("div")!;
    const details = within(detailsEl);
    // "Deals Kinetic damage" is split across a <span> for the colored
    // element name, so it's not one continuous text node — check the
    // combined textContent instead of RTL's default per-node matcher.
    expect(detailsEl.textContent).toContain("Deals Kinetic damage");
    expect(details.getByText("Uses Primary ammo")).toBeInTheDocument();
    expect(details.getByText("Kinetic weapon")).toBeInTheDocument();
    expect(details.getByText("140 RPM")).toBeInTheDocument();

    const weaponScore = within(screen.getByText("Weapon Score").closest("div")!);
    expect(weaponScore.getByText("PvE")).toBeInTheDocument();
    expect(weaponScore.getByText("PvP")).toBeInTheDocument();
    expect(weaponScore.getByText("Overall")).toBeInTheDocument();

    expect(screen.getByText("Rolls (2)")).toBeInTheDocument();
    // Roll "a" sorts perks by column: Rewind Rounds (col 0) / Zen Moment (col 1)
    expect(screen.getByText("Rewind Rounds / Zen Moment")).toBeInTheDocument();
    expect(screen.getByText("95.5")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("91.2")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const nullScoreRow = within(rows[2]); // header row + roll a + roll b
    expect(nullScoreRow.getAllByText("—")).toHaveLength(3);
  });

  it("omits the source paragraph when absent", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({ source: undefined }),
    );
    await renderPage();
    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
  });

  it("omits the perk pool section when there are no columns", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(fullWeapon({ columns: [] }));
    await renderPage();
    expect(screen.queryByText(/Perk Pool/)).not.toBeInTheDocument();
  });

  it("shows a placeholder message when there are no rolls", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(fullWeapon({ rolls: [] }));
    await renderPage();
    expect(
      screen.getByText("No curated rolls recorded for this weapon yet."),
    ).toBeInTheDocument();
  });

  it("omits craftable/enhanceable/unobtainable badges when not applicable", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({ craftable: false, enhanceable: false, obtainable: true }),
    );
    await renderPage();
    expect(screen.queryByText("Craftable")).not.toBeInTheDocument();
    expect(screen.queryByText("Enhanceable")).not.toBeInTheDocument();
    expect(screen.queryByText("Currently unobtainable")).not.toBeInTheDocument();
  });

  it("falls back to muted styling for unknown tier/element and shows — for a null RPM", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({
        tier: "Mythic" as WeaponDetail["tier"],
        element: "Prismatic" as WeaponDetail["element"],
        rpm: null,
      }),
    );
    await renderPage();
    // "Prismatic" now appears twice (header line + the Details sidebar's
    // "Deals X damage" bullet) — scope to the header specifically, since
    // that's what this test is about.
    const header = screen.getByText("Mythic").closest("header")!;
    expect(within(header).getByText("Mythic")).toHaveClass("text-muted");
    expect(within(header).getByText("Prismatic")).toHaveClass("text-muted");
    expect(screen.getByText(/— RPM/)).toBeInTheDocument();
    // The Details sidebar omits the RPM bullet entirely when null, rather
    // than showing a redundant "— RPM" a second time. Scoped to the
    // sidebar specifically — the header line above also ends in "RPM".
    const details = within(screen.getByText("Details").closest("div")!);
    expect(details.queryByText(/RPM$/)).not.toBeInTheDocument();
  });

  it("shows breaker-type properties in Details only when the weapon has one", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({ breaker_type: "Shield Piercing" }),
    );
    await renderPage();
    expect(
      screen.getByText("Has Shield Piercing properties"),
    ).toBeInTheDocument();
  });

  it("omits breaker-type properties in Details when the weapon has none", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({ breaker_type: null }),
    );
    await renderPage();
    const details = within(screen.getByText("Details").closest("div")!);
    expect(details.queryByText(/properties$/)).not.toBeInTheDocument();
  });

  it("shows — in the Weapon Score card when the weapon has no ranking (e.g. zero rolls)", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({ overall_score: null, pve_score: null, pvp_score: null }),
    );
    await renderPage();
    const weaponScore = within(screen.getByText("Weapon Score").closest("div")!);
    expect(weaponScore.getAllByText("—")).toHaveLength(3);
  });

  it("shows real weapon-level scores in the Weapon Score card when present", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(
      fullWeapon({ overall_score: 91.2, pve_score: 95.5, pvp_score: 88 }),
    );
    await renderPage();
    const weaponScore = within(screen.getByText("Weapon Score").closest("div")!);
    expect(weaponScore.getByText("95.5")).toBeInTheDocument();
    expect(weaponScore.getByText("88")).toBeInTheDocument();
    expect(weaponScore.getByText("91.2")).toBeInTheDocument();
  });

  it("calls notFound when the weapon does not exist", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(null);
    await expect(
      WeaponPage({ params: Promise.resolve({ hash: "999" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("generateMetadata uses the weapon name when found", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(fullWeapon());
    const meta = await generateMetadata({
      params: Promise.resolve({ hash: "123" }),
    });
    expect(meta.title).toBe("Fatebringer — Last Light Armory");
  });

  it("generateMetadata falls back when the weapon does not exist", async () => {
    vi.mocked(getWeaponOrNull).mockResolvedValue(null);
    const meta = await generateMetadata({
      params: Promise.resolve({ hash: "999" }),
    });
    expect(meta.title).toBe("Weapon not found");
  });

  it("generateStaticParams returns one entry per weapon in the real export", async () => {
    const params = await generateStaticParams();
    expect(params).toHaveLength(2208);
    expect(params[0]).toEqual({ hash: expect.any(String) });
  });
});
