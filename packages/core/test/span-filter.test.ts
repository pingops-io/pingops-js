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
  it("accepts spans with only modern HTTP semantic attributes", () => {
    const span = createReadableSpan({
      "http.request.method": "GET",
      "url.full": "https://api.example.com/v1/users",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("accepts spans with only legacy HTTP semantic attributes", () => {
    const span = createReadableSpan({
      "http.method": "GET",
      "http.url": "https://api.example.com/v1/users",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(true);
  });

  it("rejects spans without HTTP method/url/server attributes", () => {
    const span = createReadableSpan({
      "db.system": "postgresql",
      "db.operation": "SELECT",
    });

    expect(isSpanEligible(span as unknown as ReadableSpan)).toBe(false);
  });
});
