import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import { isSpanEligible } from "../src/filtering/span-filter";

function createReadableSpan(
  attributes: Record<string, unknown>,
  kind = SpanKind.CLIENT
) {
  return {
    name: "http.client",
    kind,
    attributes,
    spanContext() {
      return {
        traceId: "1234567890abcdef1234567890abcdef",
        spanId: "1234567890abcdef",
      };
    },
  };
}

describe("isSpanEligible", () => {
  it("accepts CLIENT spans with modern method attribute", () => {
    const span = createReadableSpan({
      "http.request.method": "GET",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("accepts CLIENT spans with legacy method attribute", () => {
    const span = createReadableSpan({
      "http.method": "GET",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("accepts CLIENT spans with modern URL attribute", () => {
    const span = createReadableSpan({
      "url.full": "https://api.example.com/v1/users",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("accepts CLIENT spans with legacy URL attribute", () => {
    const span = createReadableSpan({
      "http.url": "https://api.example.com/v1/users",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("accepts CLIENT spans with server.address only", () => {
    const span = createReadableSpan({
      "server.address": "api.example.com",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("rejects non-CLIENT spans even with HTTP attributes", () => {
    const span = createReadableSpan(
      {
        "http.request.method": "GET",
        "url.full": "https://api.example.com/v1/users",
      },
      SpanKind.SERVER
    );

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(false);
  });

  it("rejects CLIENT spans without required HTTP/server attributes", () => {
    const span = createReadableSpan({
      "db.system": "postgresql",
      "db.operation": "SELECT",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(false);
  });
});
