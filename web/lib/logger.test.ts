import { logger } from "./logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("routes each level to its matching console method, with a timestamped [LEVEL] prefix", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.debug("a debug message");
    logger.info("an info message");
    logger.warn("a warn message");
    logger.error("an error message");

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.+\] \[DEBUG\]$/),
      "a debug message",
    );
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.+\] \[INFO\]$/),
      "an info message",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.+\] \[WARN\]$/),
      "a warn message",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.+\] \[ERROR\]$/),
      "an error message",
    );
  });

  it("passes an optional context object through as a third argument", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const context = { weaponHash: 123, cause: "malformed JSON" };

    logger.error("failed to load weapon", context);

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), "failed to load weapon", context);
  });

  it("omits the third argument entirely when no context is given", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.warn("no context here");

    expect(warnSpy).toHaveBeenCalledWith(expect.any(String), "no context here");
    expect(warnSpy.mock.calls[0]).toHaveLength(2);
  });

  it("suppresses debug and info in production, but still emits warn and error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { logger: prodLogger } = await import("./logger");

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    prodLogger.debug("suppressed");
    prodLogger.info("suppressed");
    prodLogger.warn("visible");
    prodLogger.error("visible");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    vi.resetModules();
  });
});
