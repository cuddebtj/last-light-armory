import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "./error";
import { logger } from "@/lib/logger";

describe("Error boundary", () => {
  it("logs the error and shows a fallback UI with a link home", () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(<ErrorBoundary error={error} unstable_retry={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ref: abc123/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All Weapons/ })).toHaveAttribute(
      "href",
      "/",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "uncaught render error",
      expect.objectContaining({ message: "boom", digest: "abc123" }),
    );
  });

  it("omits the ref when the error has no digest (a client-side error)", () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const error = new Error("client boom");

    render(<ErrorBoundary error={error} unstable_retry={() => {}} />);

    expect(
      screen.getByText("An unexpected error occurred."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ref:/)).not.toBeInTheDocument();
  });

  it("calls unstable_retry when 'Try again' is clicked", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const user = userEvent.setup();

    render(<ErrorBoundary error={new Error("boom")} unstable_retry={retry} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
