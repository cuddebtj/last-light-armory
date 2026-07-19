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
  // Unknown element/tier exercise the styling fallbacks.
  makeWeapon({
    name: "Future Weapon",
    type: "Glaive",
    element: "Prismatic",
    tier: "Mythic",
  } as unknown as Partial<WeaponIndexEntry>),
];

function setup() {
  const user = userEvent.setup();
  render(<WeaponBrowser weapons={weapons} />);
  return user;
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
    expect(screen.getByText("—")).toBeInTheDocument(); // null rpm
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
