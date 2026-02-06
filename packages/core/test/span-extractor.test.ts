import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import type { DomainRule } from "../src/types";
import { extractSpanPayload } from "../src/utils/span-extractor";

function createSpan(attributes: Record<string, unknown>): ReadableSpan {
  return {
    name: "http.client",
    kind: SpanKind.CLIENT,
    attributes,
    startTime: [1000, 0],
    endTime: [1001, 500000000],
    status: { code: SpanStatusCode.OK },
    spanContext() {
      return {
        traceId: "1234567890abcdef1234567890abcdef",
        spanId: "abcdef1234567890",
        traceFlags: 1,
      };
    },
  } as unknown as ReadableSpan;
}

describe("extractSpanPayload", () => {
  it("extracts payload and removes body fields when capture disabled", () => {
    const span = createSpan({
      "http.url": "https://api.example.com/v1",
      "http.request.body": "secret-request",
      "http.response.body": "secret-response",
    });

    const payload = extractSpanPayload(span);

    expect(payload).not.toBeNull();
    expect(payload?.traceId).toBe("1234567890abcdef1234567890abcdef");
    expect(payload?.spanId).toBe("abcdef1234567890");
    expect(payload?.duration).toBe(1500);
    expect(payload?.attributes["http.request.body"]).toBeUndefined();
    expect(payload?.attributes["http.response.body"]).toBeUndefined();
  });

  it("uses global body capture config when no domain override", () => {
    const span = createSpan({
      "http.url": "https://api.example.com/v1",
      "http.request.body": "req",
      "http.response.body": "resp",
    });

    const payload = extractSpanPayload(
      span,
      undefined,
      undefined,
      undefined,
      true,
      true
    );

    expect(payload?.attributes["http.request.body"]).toBe("req");
    expect(payload?.attributes["http.response.body"]).toBe("resp");
  });

  it("lets domain rule body config override global config", () => {
    const span = createSpan({
      "http.url": "https://api.example.com/v1",
      "http.request.body": "req",
      "http.response.body": "resp",
    });

    const allowList: DomainRule[] = [
      {
        domain: "api.example.com",
        captureRequestBody: false,
        captureResponseBody: true,
      },
    ];

    const payload = extractSpanPayload(
      span,
      allowList,
      undefined,
      undefined,
      true,
      false
    );

    expect(payload?.attributes["http.request.body"]).toBeUndefined();
    expect(payload?.attributes["http.response.body"]).toBe("resp");
  });

  it("uses domain header allow/deny lists over global lists", () => {
    const span = createSpan({
      "http.url": "https://api.example.com/v1",
      "http.request.header.authorization": "Bearer token",
      "http.request.header.content-type": "application/json",
      "http.request.header.x-allowed": "yes",
    });

    const allowList: DomainRule[] = [
      {
        domain: "api.example.com",
        headersAllowList: ["x-allowed", "authorization"],
        headersDenyList: ["authorization"],
      },
    ];

    const payload = extractSpanPayload(span, allowList, ["content-type"]);

    expect(payload?.attributes["http.request.header"]).toEqual({
      "x-allowed": "yes",
    });
  });

  it("prefers flat/direct extracted headers over object-form headers", () => {
    const span = createSpan({
      "http.url": "https://api.example.com/v1",
      "http.request.header": {
        "x-from-object": "object",
      },
      "http.request.header.0": "x-from-flat",
      "http.request.header.1": "flat",
    });

    const payload = extractSpanPayload(span);

    expect(payload?.attributes["http.request.header"]).toEqual({
      "x-from-flat": "flat",
    });
    expect(payload?.attributes["http.request.header.0"]).toBeUndefined();
    expect(payload?.attributes["http.request.header.1"]).toBeUndefined();
  });

  it("uses fallback URL from server.address for domain matching", () => {
    const span = createSpan({
      "server.address": "api.example.com",
      "http.request.body": "req",
    });

    const allowList: DomainRule[] = [
      {
        domain: "api.example.com",
        captureRequestBody: true,
      },
    ];

    const payload = extractSpanPayload(span, allowList);
    expect(payload?.attributes["http.request.body"]).toBe("req");
  });

  it("extracts parentSpanId when present", () => {
    const span = {
      ...createSpan({ "http.url": "https://api.example.com/v1" }),
      parentSpanId: "0011223344556677",
    } as unknown as ReadableSpan;

    const payload = extractSpanPayload(span);
    expect(payload?.parentSpanId).toBe("0011223344556677");
  });
});
