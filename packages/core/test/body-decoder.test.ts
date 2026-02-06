import { describe, expect, it } from "vitest";
import {
  bufferToBodyString,
  isCompressedContentEncoding,
} from "../src/filtering/body-decoder";

describe("isCompressedContentEncoding", () => {
  it("returns true for supported encodings", () => {
    expect(isCompressedContentEncoding("gzip")).toBe(true);
    expect(isCompressedContentEncoding("br")).toBe(true);
    expect(isCompressedContentEncoding("deflate")).toBe(true);
    expect(isCompressedContentEncoding("x-gzip")).toBe(true);
    expect(isCompressedContentEncoding("x-deflate")).toBe(true);
  });

  it("handles case and spacing", () => {
    expect(isCompressedContentEncoding("  GZip ")).toBe(true);
  });

  it("uses first value from comma-separated list", () => {
    expect(isCompressedContentEncoding("gzip, identity")).toBe(true);
    expect(isCompressedContentEncoding("identity, gzip")).toBe(false);
  });

  it("handles array header values", () => {
    expect(isCompressedContentEncoding(["gzip", "identity"])).toBe(true);
    expect(isCompressedContentEncoding(["identity", "gzip"])).toBe(false);
  });

  it("returns false for unknown or empty values", () => {
    expect(isCompressedContentEncoding("identity")).toBe(false);
    expect(isCompressedContentEncoding("")).toBe(false);
    expect(isCompressedContentEncoding(undefined)).toBe(false);
    expect(isCompressedContentEncoding(null)).toBe(false);
  });
});

describe("bufferToBodyString", () => {
  it("returns null for null, undefined, or empty buffer", () => {
    expect(bufferToBodyString(null)).toBeNull();
    expect(bufferToBodyString(undefined)).toBeNull();
    expect(bufferToBodyString(Buffer.alloc(0))).toBeNull();
  });

  it("converts non-empty buffer to UTF-8 string", () => {
    const buffer = Buffer.from("hello world", "utf8");
    expect(bufferToBodyString(buffer)).toBe("hello world");
  });
});
