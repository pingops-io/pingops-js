/**
 * Header filtering logic - applies allow/deny list rules
 */

import { createLogger } from "../logger";

const log = createLogger("[PingOps HeaderFilter]");

/**
 * Normalizes header name to lowercase for case-insensitive matching
 */
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Filters headers based on allow/deny lists
 * - Deny list always wins (if header is in deny list, exclude it)
 * - Allow list filters included headers (if specified, only include these)
 * - Case-insensitive matching
 */
export function filterHeaders(
  headers: Record<string, string | string[] | undefined>,
  headersAllowList?: string[],
  headersDenyList?: string[]
): Record<string, string | string[] | undefined> {
  const originalCount = Object.keys(headers).length;
  log.debug("Filtering headers", {
    originalHeaderCount: originalCount,
    hasAllowList: !!headersAllowList && headersAllowList.length > 0,
    hasDenyList: !!headersDenyList && headersDenyList.length > 0,
    allowListCount: headersAllowList?.length || 0,
    denyListCount: headersDenyList?.length || 0,
  });

  const normalizedDenyList = headersDenyList?.map(normalizeHeaderName) ?? [];
  const normalizedAllowList = headersAllowList?.map(normalizeHeaderName) ?? [];

  const filtered: Record<string, string | string[] | undefined> = {};
  const deniedHeaders: string[] = [];
  const excludedHeaders: string[] = [];

  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = normalizeHeaderName(name);

    // Deny list always wins
    if (normalizedDenyList.includes(normalizedName)) {
      deniedHeaders.push(name);
      log.debug("Header denied by deny list", { headerName: name });
      continue;
    }

    // If allow list exists, only include headers in the list
    if (normalizedAllowList.length > 0) {
      if (!normalizedAllowList.includes(normalizedName)) {
        excludedHeaders.push(name);
        log.debug("Header excluded (not in allow list)", { headerName: name });
        continue;
      }
    }

    filtered[name] = value;
  }

  const filteredCount = Object.keys(filtered).length;
  log.info("Header filtering complete", {
    originalCount,
    filteredCount,
    deniedCount: deniedHeaders.length,
    excludedCount: excludedHeaders.length,
    deniedHeaders: deniedHeaders.length > 0 ? deniedHeaders : undefined,
    excludedHeaders: excludedHeaders.length > 0 ? excludedHeaders : undefined,
  });

  return filtered;
}

/**
 * Extracts and normalizes headers from OpenTelemetry span attributes
 *
 * Handles flat array format headers (e.g., 'http.request.header.0', 'http.request.header.1')
 * and converts them to proper key-value objects.
 *
 * Some OpenTelemetry instrumentations store headers as flat arrays:
 * - 'http.request.header.0': 'Content-Type'
 * - 'http.request.header.1': 'application/json'
 * - 'http.request.header.2': 'Authorization'
 * - 'http.request.header.3': 'Bearer token'
 *
 * This function converts them to:
 * - { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' }
 */
export function extractHeadersFromAttributes(
  attributes: Record<string, unknown>,
  headerPrefix: "http.request.header" | "http.response.header"
): Record<string, string | string[] | undefined> | null {
  const headerMap: Record<string, string | string[] | undefined> = {};
  const headerKeys: number[] = [];

  // Find all keys matching the pattern (e.g., 'http.request.header.0', 'http.request.header.1', etc.)
  for (const key in attributes) {
    if (key.startsWith(`${headerPrefix}.`) && key !== headerPrefix) {
      const match = key.match(new RegExp(`^${headerPrefix}\\.(\\d+)$`));
      if (match) {
        const index = parseInt(match[1], 10);
        headerKeys.push(index);
      }
    }
  }

  // If no flat array headers found, return null
  if (headerKeys.length === 0) {
    return null;
  }

  // Sort indices to process in order
  headerKeys.sort((a, b) => a - b);

  // Convert flat array to key-value pairs
  // Even indices are header names, odd indices are header values
  for (let i = 0; i < headerKeys.length; i += 2) {
    const nameIndex = headerKeys[i];
    const valueIndex = headerKeys[i + 1];

    if (valueIndex !== undefined) {
      const nameKey = `${headerPrefix}.${nameIndex}`;
      const valueKey = `${headerPrefix}.${valueIndex}`;

      const headerName = attributes[nameKey] as string | undefined;
      const headerValue = attributes[valueKey] as string | undefined;

      if (headerName && headerValue !== undefined) {
        // Handle multiple values for the same header name (case-insensitive)
        const normalizedName = headerName.toLowerCase();
        const existingKey = Object.keys(headerMap).find(
          (k) => k.toLowerCase() === normalizedName
        );

        if (existingKey) {
          const existing = headerMap[existingKey];
          headerMap[existingKey] = Array.isArray(existing)
            ? [...existing, headerValue]
            : [existing as string, headerValue];
        } else {
          // Use original case for the first occurrence
          headerMap[headerName] = headerValue;
        }
      }
    }
  }

  return Object.keys(headerMap).length > 0 ? headerMap : null;
}

/**
 * Type guard to check if value is a Headers-like object
 */
function isHeadersLike(
  headers: unknown
): headers is { entries: () => IterableIterator<[string, string]> } {
  return (
    typeof headers === "object" &&
    headers !== null &&
    "entries" in headers &&
    typeof (headers as { entries?: unknown }).entries === "function"
  );
}

/**
 * Normalizes headers from various sources into a proper key-value object
 */
export function normalizeHeaders(
  headers: unknown
): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};

  if (!headers) {
    return result;
  }

  try {
    // Handle Headers object (from fetch/undici)
    if (isHeadersLike(headers)) {
      for (const [key, value] of headers.entries()) {
        // Headers can have multiple values for the same key
        if (result[key]) {
          // Convert to array if not already
          const existing = result[key];
          result[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    // Handle plain object
    if (typeof headers === "object" && !Array.isArray(headers)) {
      for (const [key, value] of Object.entries(headers)) {
        // Skip numeric keys (array-like objects)
        if (!/^\d+$/.test(key)) {
          result[key] = value as string | string[] | undefined;
        }
      }
      return result;
    }

    // Handle array (shouldn't happen, but handle gracefully)
    if (Array.isArray(headers)) {
      // Try to reconstruct from array pairs
      for (let i = 0; i < headers.length; i += 2) {
        if (i + 1 < headers.length) {
          const key = String(headers[i]);
          const value = headers[i + 1] as string | string[] | undefined;
          result[key] = value;
        }
      }
      return result;
    }
  } catch {
    // Fail silently - return empty object
  }

  return result;
}
