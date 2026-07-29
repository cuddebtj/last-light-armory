import { render, screen } from "@testing-library/react";
import PerkPool from "./PerkPool";
import { toPerkMap } from "@/lib/perks";
import type { Perk, WeaponColumn } from "@/lib/types";

vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: function MockImage(props: Record<string, unknown>) {
      return createElement("img", props);
    },
  };
});

const perks: Perk[] = [
  { hash: 1, name: "Full Bore", enhanced: false, icon: "/icons/a.png", pve_score: null, pvp_score: null },
  { hash: 2, name: "Firefly", enhanced: true, icon: "/icons/b.png", pve_score: null, pvp_score: null },
  { hash: 3, name: "Firefly", enhanced: false, icon: "/icons/c.png", pve_score: null, pvp_score: null },
];
const perkMap = toPerkMap(perks);

describe("PerkPool", () => {
  it("labels the first five columns by their known semantic slot, not a raw index", () => {
    const columns: WeaponColumn[] = [
      { index: 0, perks: [1] },
      { index: 1, perks: [1] },
      { index: 2, perks: [1] },
      { index: 3, perks: [1] },
      { index: 4, perks: [1] },
    ];
    render(<PerkPool columns={columns} perkMap={perkMap} />);
    expect(screen.getByText("Barrel")).toBeInTheDocument();
    expect(screen.getByText("Magazine")).toBeInTheDocument();
    expect(screen.getByText("Trait 1")).toBeInTheDocument();
    expect(screen.getByText("Trait 2")).toBeInTheDocument();
    expect(screen.getByText("Origin Trait")).toBeInTheDocument();
  });

  it("falls back to a raw column number outside the known 0-4 range", () => {
    render(<PerkPool columns={[{ index: 5, perks: [1] }]} perkMap={perkMap} />);
    expect(screen.getByText("Column 6")).toBeInTheDocument();
  });

  it("dedupes perks by name, keeping the enhanced hash's icon even when the base version comes first", () => {
    // Hash 3 (base, not enhanced) is listed before hash 2 (enhanced) —
    // proves the preference is deliberate, not just "whichever is first."
    const { container } = render(
      <PerkPool columns={[{ index: 0, perks: [3, 2] }]} perkMap={perkMap} />,
    );
    expect(screen.getAllByText("Firefly")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://www.bungie.net/icons/b.png", // hash 2's icon, not hash 3's
    );
    // No "Enh." indicator anywhere — every shown perk is displayed as
    // already at max enhancement tier, so there's nothing left to badge.
    expect(screen.queryByText("Enh.")).not.toBeInTheDocument();
  });

  it("renders a perk icon with the perk's name as its title attribute", () => {
    render(<PerkPool columns={[{ index: 0, perks: [1] }]} perkMap={perkMap} />);
    expect(screen.getByText("Full Bore").closest("div")).toHaveAttribute(
      "title",
      "Full Bore",
    );
  });
});
