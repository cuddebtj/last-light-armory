import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchableMultiSelect from "./SearchableMultiSelect";

function setup(selected: string[] = []) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(
    <div>
      <button type="button">Outside</button>
      <SearchableMultiSelect
        label="Weapon type"
        placeholder="Add weapon type…"
        options={["Auto Rifle", "Hand Cannon", "Sword"]}
        selected={new Set(selected)}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    </div>,
  );
  return { user, onAdd, onRemove };
}

describe("SearchableMultiSelect", () => {
  it("shows every option on focus, filters as you type, and calls onAdd + clears the query on pick", async () => {
    const { user, onAdd } = setup();
    const input = screen.getByLabelText("Weapon type");
    await user.click(input);
    expect(
      within(screen.getByRole("listbox")).getAllByRole("button"),
    ).toHaveLength(3);

    await user.type(input, "hand");
    expect(
      within(screen.getByRole("listbox")).getAllByRole("button"),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Hand Cannon" }));
    expect(onAdd).toHaveBeenCalledWith("Hand Cannon");
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the dropdown on Escape", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("Weapon type");
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("Weapon type");
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("hides the dropdown entirely when no options match the typed query", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("Weapon type");
    await user.click(input);
    await user.type(input, "zzz-no-match");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders a removable chip for each selected value and calls onRemove", async () => {
    const { user, onRemove } = setup(["Sword"]);
    const chip = screen.getByRole("button", { name: /Sword/ });
    await user.click(chip);
    expect(onRemove).toHaveBeenCalledWith("Sword");
  });
});
