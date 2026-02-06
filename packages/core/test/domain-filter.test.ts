import { describe, expect, it } from "vitest";
import { shouldCaptureSpan } from "../src/filtering/domain-filter";
import type { DomainRule } from "../src/types";

describe("shouldCaptureSpan", () => {
  it("captures when no allow/deny lists are configured", () => {
    expect(shouldCaptureSpan("https://api.example.com/v1")).toBe(true);
  });

  it("denies when domain matches deny list", () => {
    const denyList: DomainRule[] = [{ domain: "api.example.com" }];
    expect(
      shouldCaptureSpan("https://api.example.com/v1", undefined, denyList)
    ).toBe(false);
  });

  it("deny list takes precedence over allow list", () => {
    const allowList: DomainRule[] = [{ domain: "api.example.com" }];
    const denyList: DomainRule[] = [{ domain: "api.example.com" }];

    expect(
      shouldCaptureSpan("https://api.example.com/v1", allowList, denyList)
    ).toBe(false);
  });

  it("supports suffix allow-list rule with leading dot", () => {
    const allowList: DomainRule[] = [{ domain: ".example.com" }];

    expect(shouldCaptureSpan("https://api.example.com/v1", allowList)).toBe(
      true
    );
    expect(shouldCaptureSpan("https://example.com/v1", allowList)).toBe(true);
    expect(shouldCaptureSpan("https://example.org/v1", allowList)).toBe(false);
  });

  it("supports path restrictions on allow-list rules", () => {
    const allowList: DomainRule[] = [
      { domain: "api.example.com", paths: ["/v1", "/health"] },
    ];

    expect(
      shouldCaptureSpan("https://api.example.com/v1/users", allowList)
    ).toBe(true);
    expect(
      shouldCaptureSpan("https://api.example.com/healthz", allowList)
    ).toBe(true);
    expect(
      shouldCaptureSpan("https://api.example.com/v2/users", allowList)
    ).toBe(false);
  });

  it("handles malformed URL strings with fallback parsing", () => {
    const allowList: DomainRule[] = [{ domain: "api.example.com" }];

    expect(shouldCaptureSpan("api.example.com/path", allowList)).toBe(true);
    expect(shouldCaptureSpan("not a valid url", allowList)).toBe(false);
  });
});
