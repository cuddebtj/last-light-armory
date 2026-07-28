import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalError from "./global-error";
import { logger } from "@/lib/logger";

describe("GlobalError boundary", () => {
  it("logs the error and shows a fallback UI", () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("root layout boom"), { digest: "xyz789" });

    render(<GlobalError error={error} unstable_retry={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ref: xyz789/)).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      "uncaught root layout error",
      expect.objectContaining({ message: "root layout boom", digest: "xyz789" }),
    );
  });

  it("omits the ref when the error has no digest", () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});

    render(<GlobalError error={new Error("boom")} unstable_retry={() => {}} />);

    expect(
      screen.getByText("An unexpected error occurred."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ref:/)).not.toBeInTheDocument();
  });

  it("calls unstable_retry when 'Try again' is clicked", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const user = userEvent.setup();

    render(<GlobalError error={new Error("boom")} unstable_retry={retry} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
