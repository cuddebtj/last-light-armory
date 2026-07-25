import { render, screen } from "@testing-library/react";
import SortHeader from "./SortHeader";

type Key = "a" | "b";

describe("SortHeader", () => {
  it("shows a plain 'Sort by' label and no indicator when inactive", () => {
    render(
      <SortHeader<Key>
        label="Name"
        sortKey="a"
        sort={{ key: "b", dir: "asc" }}
        onSort={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sort by Name" }),
    ).toBeInTheDocument();
  });

  it("shows the direction indicator and no right-alignment class by default when active", () => {
    render(
      <SortHeader<Key>
        label="Name"
        sortKey="a"
        sort={{ key: "a", dir: "asc" }}
        onSort={() => {}}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Name, sorted ascending",
    });
    expect(button).toBeInTheDocument();
    expect(button.className).not.toContain("justify-end");
  });

  it("applies right-alignment classes when align is 'right'", () => {
    render(
      <SortHeader<Key>
        label="Name"
        sortKey="a"
        sort={{ key: "a", dir: "desc" }}
        onSort={() => {}}
        align="right"
      />,
    );
    const button = screen.getByRole("button", {
      name: "Name, sorted descending",
    });
    expect(button.className).toContain("justify-end");
  });
});
