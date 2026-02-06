import { describe, expect, it } from "vitest";
import {
  DEFAULT_REDACTION_CONFIG,
  HeaderRedactionStrategy,
  isSensitiveHeader,
  redactHeaderValue,
} from "../src/filtering/sensitive-headers";

describe("isSensitiveHeader", () => {
  it("matches case-insensitively", () => {
    expect(isSensitiveHeader("Authorization")).toBe(true);
    expect(isSensitiveHeader("X-API-KEY")).toBe(true);
  });

  it("matches by substring", () => {
    expect(isSensitiveHeader("x-custom-api-key-value")).toBe(true);
  });

  it("returns false for empty input or pattern list", () => {
    expect(isSensitiveHeader("")).toBe(false);
    expect(isSensitiveHeader("content-type", [])).toBe(false);
  });

  it("uses provided patterns", () => {
    expect(isSensitiveHeader("x-secret", ["token"])).toBe(false);
    expect(isSensitiveHeader("x-secret-token", ["token"])).toBe(true);
  });
});

describe("redactHeaderValue", () => {
  it("returns undefined/null unchanged", () => {
    expect(
      redactHeaderValue(undefined, DEFAULT_REDACTION_CONFIG)
    ).toBeUndefined();
    expect(
      redactHeaderValue(null as never, DEFAULT_REDACTION_CONFIG)
    ).toBeNull();
  });

  it("replaces whole value with REPLACE strategy", () => {
    const config = {
      ...DEFAULT_REDACTION_CONFIG,
      strategy: HeaderRedactionStrategy.REPLACE,
      redactionString: "***",
    };
    expect(redactHeaderValue("secret", config)).toBe("***");
  });

  it("redacts with PARTIAL strategy", () => {
    const config = {
      ...DEFAULT_REDACTION_CONFIG,
      strategy: HeaderRedactionStrategy.PARTIAL,
      redactionString: "***",
      visibleChars: 2,
    };
    expect(redactHeaderValue("secret", config)).toBe("se***");
    expect(redactHeaderValue("ab", config)).toBe("***");
  });

  it("redacts with PARTIAL_END strategy", () => {
    const config = {
      ...DEFAULT_REDACTION_CONFIG,
      strategy: HeaderRedactionStrategy.PARTIAL_END,
      redactionString: "***",
      visibleChars: 2,
    };
    expect(redactHeaderValue("secret", config)).toBe("***et");
    expect(redactHeaderValue("ab", config)).toBe("***");
  });

  it("handles arrays of header values", () => {
    const config = {
      ...DEFAULT_REDACTION_CONFIG,
      strategy: HeaderRedactionStrategy.REPLACE,
      redactionString: "***",
    };
    expect(redactHeaderValue(["one", "two"], config)).toEqual(["***", "***"]);
  });
});
