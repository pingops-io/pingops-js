import { describe, expect, it } from "vitest";
import {
  getHttpUrlFromAttributes,
  hasHttpMethodAttribute,
  hasHttpUrlAttribute,
} from "../src/utils/http-attributes";

describe("http attributes helpers", () => {
  it("detects method attributes across legacy and modern keys", () => {
    expect(hasHttpMethodAttribute({ "http.method": "GET" })).toBe(true);
    expect(hasHttpMethodAttribute({ "http.request.method": "GET" })).toBe(true);
    expect(hasHttpMethodAttribute({})).toBe(false);
  });

  it("detects url attributes across legacy and modern keys", () => {
    expect(hasHttpUrlAttribute({ "http.url": "https://legacy" })).toBe(true);
    expect(hasHttpUrlAttribute({ "url.full": "https://modern" })).toBe(true);
    expect(hasHttpUrlAttribute({})).toBe(false);
  });

  it("prefers legacy URL, then modern URL, then server.address fallback", () => {
    expect(
      getHttpUrlFromAttributes({
        "http.url": "https://legacy.example.com",
        "url.full": "https://modern.example.com",
      })
    ).toBe("https://legacy.example.com");

    expect(
      getHttpUrlFromAttributes({ "url.full": "https://modern.example.com" })
    ).toBe("https://modern.example.com");

    expect(
      getHttpUrlFromAttributes({ "server.address": "api.example.com" })
    ).toBe("https://api.example.com");

    expect(getHttpUrlFromAttributes({})).toBeUndefined();
  });
});
