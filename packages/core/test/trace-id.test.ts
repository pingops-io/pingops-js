import { describe, expect, it } from "vitest";
import { createTraceId, uint8ArrayToHex } from "../src/trace-id";

describe("uint8ArrayToHex", () => {
  it("converts bytes to lowercase hex", () => {
    expect(uint8ArrayToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });
});

describe("createTraceId", () => {
  it("creates deterministic 32-char hex trace IDs for a seed", async () => {
    const a = await createTraceId("same-seed");
    const b = await createTraceId("same-seed");
    const c = await createTraceId("different-seed");

    expect(a).toHaveLength(32);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("creates random 32-char hex trace IDs without a seed", async () => {
    const id = await createTraceId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});
