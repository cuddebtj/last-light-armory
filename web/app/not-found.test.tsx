import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("renders a message and a link back home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Not Found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All Weapons/ })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
