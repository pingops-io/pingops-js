import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger";

describe("createLogger", () => {
  afterEach(() => {
    delete process.env.PINGOPS_DEBUG;
    vi.restoreAllMocks();
  });

  it("emits debug logs only when PINGOPS_DEBUG=true", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    process.env.PINGOPS_DEBUG = "false";
    createLogger("[Test]").debug("hidden");

    process.env.PINGOPS_DEBUG = "true";
    createLogger("[Test]").debug("visible");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0]?.[0]).toContain("[Test] [DEBUG] visible");
  });

  it("emits info/warn/error regardless of debug flag", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    process.env.PINGOPS_DEBUG = "false";
    const logger = createLogger("[Test]");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(logSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
