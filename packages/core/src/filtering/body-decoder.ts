/**
 * Minimal body handling: buffer to string for span attributes.
 * No decompression or truncation; for compressed responses the instrumentation
 * sends base64 + content-encoding so the backend can decompress.
 */

/** Span attribute for response content-encoding when body is sent as base64. */
export const HTTP_RESPONSE_CONTENT_ENCODING = "http.response.content_encoding";

const COMPRESSED_ENCODINGS = new Set([
  "gzip",
  "br",
  "deflate",
  "x-gzip",
  "x-deflate",
]);

function safeStringify(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return undefined;
}

function normalizeHeaderValue(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const parts = v
      .map((item) => safeStringify(item))
      .filter((item): item is string => item !== undefined);
    const joined = parts.join(", ").trim();
    return joined || undefined;
  }

  const s = safeStringify(v);
  if (!s) return undefined;
  return s.trim() || undefined;
}

/**
 * Returns true if the content-encoding header indicates a compressed body
 * (gzip, br, deflate, x-gzip, x-deflate). Used to decide whether to send
 * body as base64 + content-encoding for backend decompression.
 */
export function isCompressedContentEncoding(headerValue: unknown): boolean {
  const raw = normalizeHeaderValue(headerValue);
  if (!raw) return false;
  const first = raw.split(",")[0].trim().toLowerCase();
  return COMPRESSED_ENCODINGS.has(first);
}

/**
 * Converts a buffer to a UTF-8 string for use as request/response body on spans.
 * Returns null for null, undefined, or empty buffer.
 */
export function bufferToBodyString(
  buffer: Buffer | null | undefined
): string | null {
  if (buffer == null || buffer.length === 0) return null;
  return buffer.toString("utf8");
}
