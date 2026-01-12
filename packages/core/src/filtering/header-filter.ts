/**
 * Header filtering logic - applies allow/deny list rules and redaction
 */

import { createLogger } from "../logger";
import type { HeaderRedactionConfig } from "./sensitive-headers";
import {
  DEFAULT_REDACTION_CONFIG,
  isSensitiveHeader,
  redactHeaderValue,
  HeaderRedactionStrategy,
} from "./sensitive-headers";

const log = createLogger("[PingOps HeaderFilter]");

/**
 * Normalizes header name to lowercase for case-insensitive matching
 */
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Merges redaction config with defaults
 */
function mergeRedactionConfig(
  config?: HeaderRedactionConfig
): Required<HeaderRedactionConfig> {
  // If config is undefined, use default config (enabled by default)
  if (!config) {
    return DEFAULT_REDACTION_CONFIG;
  }

  // If explicitly disabled, return disabled config
  if (config.enabled === false) {
    return { ...DEFAULT_REDACTION_CONFIG, enabled: false };
  }

  // Otherwise, merge with defaults (enabled defaults to true)
  return {
    sensitivePatterns:
      config.sensitivePatterns ?? DEFAULT_REDACTION_CONFIG.sensitivePatterns,
    strategy: config.strategy ?? DEFAULT_REDACTION_CONFIG.strategy,
    redactionString:
      config.redactionString ?? DEFAULT_REDACTION_CONFIG.redactionString,
    visibleChars: config.visibleChars ?? DEFAULT_REDACTION_CONFIG.visibleChars,
    enabled: config.enabled ?? DEFAULT_REDACTION_CONFIG.enabled,
  };
}

/**
 * Filters headers based on allow/deny lists and applies redaction to sensitive headers
 * - Deny list always wins (if header is in deny list, exclude it)
 * - Allow list filters included headers (if specified, only include these)
 * - Sensitive headers are redacted after filtering (if redaction is enabled)
 * - Case-insensitive matching
 *
 * @param headers - Headers to filter
 * @param headersAllowList - Optional allow list of header names to include
 * @param headersDenyList - Optional deny list of header names to exclude
 * @param redactionConfig - Optional configuration for header value redaction
 * @returns Filtered and redacted headers
 */
export function filterHeaders(
  headers: Record<string, string | string[] | undefined>,
  headersAllowList?: string[],
  headersDenyList?: string[],
  redactionConfig?: HeaderRedactionConfig
): Record<string, string | string[] | undefined> {
  const originalCount = Object.keys(headers).length;
  const redaction = mergeRedactionConfig(redactionConfig);

  log.debug("Filtering headers", {
    originalHeaderCount: originalCount,
    hasAllowList: !!headersAllowList && headersAllowList.length > 0,
    hasDenyList: !!headersDenyList && headersDenyList.length > 0,
    allowListCount: headersAllowList?.length || 0,
    denyListCount: headersDenyList?.length || 0,
    redactionEnabled: redaction.enabled,
    redactionStrategy: redaction.strategy,
  });

  const normalizedDenyList = headersDenyList?.map(normalizeHeaderName) ?? [];
  const normalizedAllowList = headersAllowList?.map(normalizeHeaderName) ?? [];

  const filtered: Record<string, string | string[] | undefined> = {};
  const deniedHeaders: string[] = [];
  const excludedHeaders: string[] = [];
  const redactedHeaders: string[] = [];

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

    // Apply redaction if enabled and header is sensitive
    let finalValue = value;
    if (redaction.enabled) {
      try {
        // Check if header matches sensitive patterns
        if (isSensitiveHeader(name, redaction.sensitivePatterns)) {
          // Handle REMOVE strategy at filter level
          if (redaction.strategy === HeaderRedactionStrategy.REMOVE) {
            log.debug("Header removed by redaction strategy", {
              headerName: name,
            });
            continue;
          }

          // Redact the value
          finalValue = redactHeaderValue(value, redaction);
          redactedHeaders.push(name);
          log.debug("Header value redacted", {
            headerName: name,
            strategy: redaction.strategy,
          });
        }
      } catch (error) {
        // Log error but don't fail - use original value as fallback
        log.warn("Error redacting header value", {
          headerName: name,
          error: error instanceof Error ? error.message : String(error),
        });
        finalValue = value;
      }
    }

    filtered[name] = finalValue;
  }

  const filteredCount = Object.keys(filtered).length;
  log.info("Header filtering complete", {
    originalCount,
    filteredCount,
    deniedCount: deniedHeaders.length,
    excludedCount: excludedHeaders.length,
    redactedCount: redactedHeaders.length,
    deniedHeaders: deniedHeaders.length > 0 ? deniedHeaders : undefined,
    excludedHeaders: excludedHeaders.length > 0 ? excludedHeaders : undefined,
    redactedHeaders: redactedHeaders.length > 0 ? redactedHeaders : undefined,
  });

  return filtered;
}

/**
 * Extracts and normalizes headers from OpenTelemetry span attributes
 *
 * Handles two formats:
 * 1. Flat array format (e.g., 'http.request.header.0', 'http.request.header.1')
 *    - 'http.request.header.0': 'Content-Type'
 *    - 'http.request.header.1': 'application/json'
 * 2. Direct key-value format (e.g., 'http.request.header.date', 'http.request.header.content-type')
 *    - 'http.request.header.date': 'Mon, 12 Jan 2026 20:22:38 GMT'
 *    - 'http.request.header.content-type': 'application/json'
 *
 * This function converts them to:
 * - { 'Content-Type': 'application/json', 'date': 'Mon, 12 Jan 2026 20:22:38 GMT' }
 */
export function extractHeadersFromAttributes(
  attributes: Record<string, unknown>,
  headerPrefix: "http.request.header" | "http.response.header"
): Record<string, string | string[] | undefined> | null {
  const headerMap: Record<string, string | string[] | undefined> = {};
  const headerKeys: number[] = [];
  const directKeyValueHeaders: Array<{ key: string; headerName: string }> = [];

  const prefixPattern = `${headerPrefix}.`;
  const numericPattern = new RegExp(
    `^${headerPrefix.replace(/\./g, "\\.")}\\.(\\d+)$`
  );

  // Find all keys matching the pattern
  for (const key in attributes) {
    if (key.startsWith(prefixPattern) && key !== headerPrefix) {
      // Check for numeric index format (flat array)
      const numericMatch = key.match(numericPattern);
      if (numericMatch) {
        const index = parseInt(numericMatch[1], 10);
        headerKeys.push(index);
      } else {
        // Check for direct key-value format (e.g., 'http.request.header.date')
        const headerName = key.substring(prefixPattern.length);
        if (headerName.length > 0) {
          directKeyValueHeaders.push({ key, headerName });
        }
      }
    }
  }

  // Process numeric index format (flat array)
  if (headerKeys.length > 0) {
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
  }

  // Process direct key-value format (e.g., 'http.request.header.date')
  if (directKeyValueHeaders.length > 0) {
    for (const { key, headerName } of directKeyValueHeaders) {
      const headerValue = attributes[key];

      if (headerValue !== undefined && headerValue !== null) {
        // Convert to string if needed
        const stringValue =
          typeof headerValue === "string" ? headerValue : String(headerValue);

        // Handle multiple values for the same header name (case-insensitive)
        const normalizedName = headerName.toLowerCase();
        const existingKey = Object.keys(headerMap).find(
          (k) => k.toLowerCase() === normalizedName
        );

        if (existingKey) {
          const existing = headerMap[existingKey];
          headerMap[existingKey] = Array.isArray(existing)
            ? [...existing, stringValue]
            : [existing as string, stringValue];
        } else {
          // Use the header name as stored (may be lowercase from instrumentation)
          headerMap[headerName] = stringValue;
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
