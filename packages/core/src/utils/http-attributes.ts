/**
 * Helpers for reading HTTP-related span attributes across legacy and modern
 * OpenTelemetry semantic conventions.
 */

type SpanAttributes = Record<string, unknown>;

/**
 * Returns true when either legacy or modern HTTP method attribute is present.
 */
export function hasHttpMethodAttribute(attributes: SpanAttributes): boolean {
  return (
    attributes["http.method"] !== undefined ||
    attributes["http.request.method"] !== undefined
  );
}

/**
 * Returns true when either legacy or modern HTTP URL attribute is present.
 */
export function hasHttpUrlAttribute(attributes: SpanAttributes): boolean {
  return (
    attributes["http.url"] !== undefined || attributes["url.full"] !== undefined
  );
}

/**
 * Extracts URL from known HTTP attributes with support for legacy + modern keys.
 *
 * If no explicit URL exists but server.address is available, falls back to a
 * synthetic HTTPS URL for downstream domain filtering.
 */
export function getHttpUrlFromAttributes(
  attributes: SpanAttributes
): string | undefined {
  const legacyUrl = attributes["http.url"];
  if (typeof legacyUrl === "string" && legacyUrl.length > 0) {
    return legacyUrl;
  }

  const modernUrl = attributes["url.full"];
  if (typeof modernUrl === "string" && modernUrl.length > 0) {
    return modernUrl;
  }

  const serverAddress = attributes["server.address"];
  if (typeof serverAddress === "string" && serverAddress.length > 0) {
    return `https://${serverAddress}`;
  }

  return undefined;
}
