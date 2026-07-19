import { render, screen } from "@testing-library/react";
import Home from "./page";
import { makeMeta, makeWeapon } from "@/test/fixtures";

vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: function MockImage(props: Record<string, unknown>) {
      return createElement("img", props);
    },
  };
});

vi.mock("@/lib/data", () => ({
  getMeta: vi.fn(async () => makeMeta({ weapon_count: 2, roll_count: 85 })),
  getWeaponIndex: vi.fn(async () => [
    makeWeapon({ name: "Alpha Weapon" }),
    makeWeapon({ name: "Beta Weapon" }),
  ]),
}));

describe("Home page", () => {
  it("renders the header, formatted meta line, and the weapon browser", async () => {
    render(await Home());

    expect(
      screen.getByRole("heading", { name: /Last Light Armory/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 weapons · 85 rolls · manifest updated Jul 6, 2026"),
    ).toBeInTheDocument();

    // The browser is live with the loaded weapons.
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Alpha Weapon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search weapons…")).toBeInTheDocument();
  });
});
