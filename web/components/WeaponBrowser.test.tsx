import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeaponBrowser from "./WeaponBrowser";
import { makeWeapon } from "@/test/fixtures";
import type { WeaponIndexEntry } from "@/lib/types";

vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: function MockImage(props: Record<string, unknown>) {
      return createElement("img", props);
    },
  };
});

const weapons: WeaponIndexEntry[] = [
  makeWeapon({ name: "Austringer", type: "Hand Cannon", slot: "Kinetic", element: "Kinetic", tier: "Legendary", rpm: 140 }),
  makeWeapon({ name: "Fatebringer", type: "Hand Cannon", slot: "Kinetic", element: "Arc", tier: "Legendary", rpm: 140 }),
  makeWeapon({ name: "Cartesian Coordinate", type: "Fusion Rifle", slot: "Energy", element: "Solar", tier: "Legendary", rpm: 660 }),
  makeWeapon({ name: "Gjallarhorn", type: "Rocket Launcher", slot: "Power", element: "Solar", tier: "Exotic", rpm: 15, roll_count: 1 }),
  makeWeapon({ name: "Falling Guillotine", type: "Sword", slot: "Power", element: "Void", tier: "Legendary", rpm: null }),
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

function setup() {
  const user = userEvent.setup();
  render(<WeaponBrowser weapons={weapons} />);
  return user;
}

function renderedHashOrder(): number[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href?.startsWith("/weapons/"))
    .map((href) => Number(href.replace("/weapons/", "")));
}

describe("WeaponBrowser", () => {
  it("renders every weapon with count, icons, frame, rpm, and roll count", () => {
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
    expect(screen.getAllByText("—")).toHaveLength(2); // two null-rpm weapons
    expect(screen.getByText("660")).toBeInTheDocument();
  });

  it("derives the type filter options from the data, sorted", () => {
    setup();
    const options = screen
      .getByLabelText("Weapon type")
      .querySelectorAll("option");
    expect([...options].map((o) => o.textContent)).toEqual([
      "All types",
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

  it("shows Reset only when filters are active, and clears everything", async () => {
    const user = setup();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search weapons…"), "zzzz");
    expect(await screen.findByText("0 of 6")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Slot"), "Energy");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("6 of 6")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search weapons…")).toHaveValue("");
    expect(screen.getByLabelText("Slot")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });
});
