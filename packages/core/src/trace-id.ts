/**
 * Deterministic and random trace ID generation for PingOps
 */

/**
 * Converts a Uint8Array to a lowercase hex string.
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates a trace ID (32 hex chars).
 * - If `seed` is provided: deterministic via SHA-256 of the seed (first 32 hex chars).
 * - Otherwise: random 16 bytes as 32 hex chars.
 */
export async function createTraceId(seed?: string): Promise<string> {
  if (seed) {
    const data = new TextEncoder().encode(seed);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    return uint8ArrayToHex(hashArray).slice(0, 32);
  }

  const randomValues = crypto.getRandomValues(new Uint8Array(16));
  return uint8ArrayToHex(randomValues);
}
