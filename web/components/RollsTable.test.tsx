import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RollsTable, { type RollRow } from "./RollsTable";

const rolls: RollRow[] = [
  { key: "a", displayPerks: "Rewind Rounds / Firefly", pve_score: 45.3, pvp_score: 40.4, overall_score: 42.8 },
  { key: "b", displayPerks: "Explosive Payload / Firefly", pve_score: 91.2, pvp_score: 10, overall_score: 60 },
  { key: "c", displayPerks: "No Score Roll", pve_score: null, pvp_score: null, overall_score: null },
];

function rowOrder() {
  return screen
    .getAllByRole("row")
    .slice(1) // drop the header row
    .map((row) => row.textContent);
}

describe("RollsTable", () => {
  it("defaults to Overall descending, with null scores sorted last", () => {
    render(<RollsTable rolls={rolls} />);
    const order = rowOrder();
    expect(order[0]).toContain("Explosive Payload / Firefly"); // 60
    expect(order[1]).toContain("Rewind Rounds / Firefly"); // 42.8
    expect(order[2]).toContain("No Score Roll"); // null, sorts last
  });

  it("sorts by PvE descending on first click, then ascending on a second click", async () => {
    const user = userEvent.setup();
    render(<RollsTable rolls={rolls} />);

    await user.click(screen.getByRole("button", { name: "Sort by PvE" }));
    expect(rowOrder()[0]).toContain("Explosive Payload / Firefly"); // 91.2 highest, desc first

    await user.click(
      screen.getByRole("button", { name: "PvE, sorted descending" }),
    );
    expect(rowOrder()[0]).toContain("Rewind Rounds / Firefly"); // 45.3 lowest non-null, asc first

    await user.click(
      screen.getByRole("button", { name: "PvE, sorted ascending" }),
    );
    expect(rowOrder()[0]).toContain("Explosive Payload / Firefly"); // back to desc
  });

  it("switches the active sort column when a different header is clicked", async () => {
    const user = userEvent.setup();
    render(<RollsTable rolls={rolls} />);

    await user.click(screen.getByRole("button", { name: "Sort by PvP" }));
    expect(
      screen.getByRole("button", { name: "PvP, sorted descending" }),
    ).toBeInTheDocument();
    expect(rowOrder()[0]).toContain("Rewind Rounds / Firefly"); // pvp 40.4 highest
  });

  it("renders — for null scores", () => {
    render(<RollsTable rolls={rolls} />);
    const noScoreRow = screen.getByText("No Score Roll").closest("tr")!;
    expect(noScoreRow.textContent).toContain("—");
  });
});
