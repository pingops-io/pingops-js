import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
  type ZlibOptions,
} from "node:zlib";

export interface DecodeBodyOptions {
  contentEncoding?: unknown;
  contentType?: unknown;
}

function normalizeHeaderValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function parseContentEncodings(contentEncoding?: string): string[] {
  if (!contentEncoding) return [];
  return contentEncoding
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .filter((v) => v !== "identity");
}

function isLikelyTextContentType(contentType?: string): boolean | undefined {
  if (!contentType) return undefined;
  const ct = contentType.toLowerCase();

  // Definitely textual
  if (ct.startsWith("text/")) return true;
  if (ct.includes("application/json")) return true;
  if (ct.includes("+json")) return true;
  if (ct.includes("application/xml")) return true;
  if (ct.includes("+xml")) return true;
  if (ct.includes("application/x-www-form-urlencoded")) return true;
  if (ct.includes("application/javascript")) return true;
  if (ct.includes("application/graphql")) return true;

  // Definitely binary-ish
  if (ct.startsWith("image/")) return false;
  if (ct.startsWith("audio/")) return false;
  if (ct.startsWith("video/")) return false;
  if (ct.startsWith("font/")) return false;
  if (ct.includes("application/octet-stream")) return false;
  if (ct.includes("application/pdf")) return false;
  if (ct.includes("application/zip")) return false;
  if (ct.includes("application/gzip")) return false;

  return undefined;
}

function looksLikeGzip(buf: Buffer): boolean {
  // gzip magic numbers: 1f 8b 08
  return buf.length >= 3 && buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 8;
}

function toBase64Preview(buf: Buffer, maxChars = 1024): string {
  const b64 = buf.toString("base64");
  if (b64.length <= maxChars) return b64;
  return `${b64.slice(0, maxChars)}…(truncated)`;
}

function tryDecodeUtf8(buf: Buffer): {
  text: string;
  isProbablyBinary: boolean;
} {
  const text = buf.toString("utf8");
  if (!text) return { text, isProbablyBinary: false };

  // Heuristic: lots of replacement chars/control chars usually means binary.
  let replacement = 0;
  let control = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0xfffd) replacement++;
    // Control chars excluding \t \n \r
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f)
    ) {
      control++;
    }
  }
  const ratio = (replacement + control) / Math.max(1, text.length);
  return { text, isProbablyBinary: ratio > 0.05 };
}

function maybeFormatJson(text: string, contentType?: string): string {
  const ct = contentType?.toLowerCase();
  const isJson =
    !!ct && (ct.includes("application/json") || ct.includes("+json"));
  if (!isJson) return text;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

/**
 * Decodes a captured HTTP body buffer into a readable string.
 *
 * - Honors common `content-encoding` values (gzip/deflate/br)
 * - Attempts to format JSON into canonical JSON string (no whitespace)
 * - Falls back to a base64 preview for binary/undecodable payloads
 */
export function decodeCapturedBody(
  rawBody: Buffer,
  opts: DecodeBodyOptions
): string | undefined {
  if (!rawBody || rawBody.length === 0) return undefined;

  const contentEncoding = normalizeHeaderValue(opts.contentEncoding);
  const contentType = normalizeHeaderValue(opts.contentType);

  // If content-type is clearly binary, don't try to interpret it as text.
  const likelyText = isLikelyTextContentType(contentType);
  if (likelyText === false) {
    const encLabel = contentEncoding
      ? `; content-encoding=${contentEncoding}`
      : "";
    const ctLabel = contentType ? `; content-type=${contentType}` : "";
    return `[binary body${ctLabel}${encLabel}; base64=${toBase64Preview(rawBody)}]`;
  }

  let bodyBuf = rawBody;
  let decompressionFailed = false;

  const encodings = parseContentEncodings(contentEncoding);
  // Defensive: if we see gzip magic but no header, still try to gunzip.
  if (encodings.length === 0 && looksLikeGzip(bodyBuf)) {
    encodings.push("gzip");
  }

  if (encodings.length > 0) {
    // Decode in reverse order (encodings applied in order when sending)
    const reversed = [...encodings].reverse();
    for (const enc of reversed) {
      try {
        const zlibOpts: ZlibOptions = {};
        if (enc === "gzip" || enc === "x-gzip") {
          bodyBuf = gunzipSync(bodyBuf, zlibOpts);
        } else if (enc === "deflate" || enc === "x-deflate") {
          bodyBuf = inflateSync(bodyBuf, zlibOpts);
        } else if (enc === "br") {
          bodyBuf = brotliDecompressSync(bodyBuf);
        } else {
          // Unknown/unsupported encoding; leave buffer as-is.
          break;
        }
      } catch {
        // Truncated/incomplete chunks or unsupported format; fall back.
        decompressionFailed = true;
        bodyBuf = rawBody;
        break;
      }
    }
  }

  const { text, isProbablyBinary } = tryDecodeUtf8(bodyBuf);
  if (!text) return undefined;

  if (isProbablyBinary) {
    const encLabel = contentEncoding
      ? `; content-encoding=${contentEncoding}`
      : "";
    const ctLabel = contentType ? `; content-type=${contentType}` : "";

    // If this was advertised as compressed and we couldn't decompress it, it's
    // most likely truncated compressed bytes (not actual binary content).
    if (encodings.length > 0 && decompressionFailed) {
      return `[truncated compressed body${ctLabel}${encLabel}; capturedBytes=${rawBody.length}; base64=${toBase64Preview(rawBody)}]`;
    }

    return `[binary body${ctLabel}${encLabel}; capturedBytes=${rawBody.length}; base64=${toBase64Preview(rawBody)}]`;
  }

  return maybeFormatJson(text, contentType);
}
