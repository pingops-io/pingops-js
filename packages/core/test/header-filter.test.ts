import { describe, expect, it } from "vitest";
import {
  extractHeadersFromAttributes,
  filterHeaders,
  normalizeHeaders,
} from "../src/filtering/header-filter";
import { HeaderRedactionStrategy } from "../src/filtering/sensitive-headers";

describe("filterHeaders", () => {
  const headers = {
    Authorization: "Bearer secret-token",
    "Content-Type": "application/json",
    "X-Request-Id": "req-1",
  };

  it("applies deny list before allow list", () => {
    const result = filterHeaders(
      headers,
      ["authorization", "content-type"],
      ["authorization"]
    );

    expect(result).toEqual({ "Content-Type": "application/json" });
  });

  it("filters by allow list case-insensitively", () => {
    const result = filterHeaders(headers, ["content-type"]);
    expect(result).toEqual({ "Content-Type": "application/json" });
  });

  it("redacts sensitive headers by default", () => {
    const result = filterHeaders(headers);
    expect(result.Authorization).toBe("[REDACTED]");
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("supports remove redaction strategy", () => {
    const result = filterHeaders(headers, undefined, undefined, {
      strategy: HeaderRedactionStrategy.REMOVE,
    });

    expect(result.Authorization).toBeUndefined();
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("supports disabling redaction", () => {
    const result = filterHeaders(headers, undefined, undefined, {
      enabled: false,
    });

    expect(result.Authorization).toBe("Bearer secret-token");
  });
});

describe("extractHeadersFromAttributes", () => {
  it("extracts flat indexed headers", () => {
    const attrs = {
      "http.request.header.0": "Content-Type",
      "http.request.header.1": "application/json",
      "http.request.header.2": "X-Test",
      "http.request.header.3": "abc",
    };

    expect(extractHeadersFromAttributes(attrs, "http.request.header")).toEqual({
      "Content-Type": "application/json",
      "X-Test": "abc",
    });
  });

  it("merges duplicate flat headers case-insensitively", () => {
    const attrs = {
      "http.request.header.0": "Set-Cookie",
      "http.request.header.1": "a=1",
      "http.request.header.2": "set-cookie",
      "http.request.header.3": "b=2",
    };

    expect(extractHeadersFromAttributes(attrs, "http.request.header")).toEqual({
      "Set-Cookie": ["a=1", "b=2"],
    });
  });

  it("extracts direct key-value headers and stringifies non-string values", () => {
    const attrs = {
      "http.response.header.date": "Mon, 12 Jan 2026 20:22:38 GMT",
      "http.response.header.retry-after": 30,
    };

    expect(extractHeadersFromAttributes(attrs, "http.response.header")).toEqual(
      {
        date: "Mon, 12 Jan 2026 20:22:38 GMT",
        "retry-after": "30",
      }
    );
  });

  it("returns null when no headers are found", () => {
    expect(extractHeadersFromAttributes({}, "http.request.header")).toBeNull();
  });
});

describe("normalizeHeaders", () => {
  it("normalizes plain objects and ignores numeric keys", () => {
    const normalized = normalizeHeaders({
      "content-type": "application/json",
      0: "ignored",
    });

    expect(normalized).toEqual({ "content-type": "application/json" });
  });

  it("normalizes tuple arrays", () => {
    const normalized = normalizeHeaders(["content-type", "application/json"]);
    expect(normalized).toEqual({ "content-type": "application/json" });
  });

  it("returns empty object for falsy input", () => {
    expect(normalizeHeaders(undefined)).toEqual({});
    expect(normalizeHeaders(null)).toEqual({});
  });

  it("normalizes Headers-like objects", () => {
    const normalized = normalizeHeaders(
      new Headers([
        ["set-cookie", "a=1"],
        ["x-id", "abc"],
      ])
    );

    expect(normalized).toEqual({
      "set-cookie": "a=1",
      "x-id": "abc",
    });
  });
});
