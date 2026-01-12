/**
 * Extracts structured data from spans for PingOps backend
 */

import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { DomainRule, SpanPayload } from "../types";
import type { HeaderRedactionConfig } from "../filtering/sensitive-headers";
import {
  filterHeaders,
  extractHeadersFromAttributes,
} from "../filtering/header-filter";

/**
 * Extracts domain from URL
 */
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    const match = url.match(/^(?:https?:\/\/)?([^/]+)/);
    return match ? match[1] : "";
  }
}

/**
 * Gets domain rule configuration for a given URL
 */
function getDomainRule(
  url: string,
  domainAllowList?: DomainRule[]
): DomainRule | undefined {
  if (!domainAllowList) {
    return undefined;
  }

  const domain = extractDomainFromUrl(url);
  for (const rule of domainAllowList) {
    if (
      domain === rule.domain ||
      domain.endsWith(`.${rule.domain}`) ||
      domain === rule.domain.slice(1)
    ) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Determines if body should be captured based on priority:
 * domain rule > global config > default (false)
 */
function shouldCaptureBody(
  domainRule: DomainRule | undefined,
  globalConfig: boolean | undefined,
  bodyType: "request" | "response"
): boolean {
  // Check domain-specific rule first
  if (domainRule) {
    const domainValue =
      bodyType === "request"
        ? domainRule.captureRequestBody
        : domainRule.captureResponseBody;
    if (domainValue !== undefined) {
      return domainValue;
    }
  }
  // Fall back to global config
  if (globalConfig !== undefined) {
    return globalConfig;
  }
  // Default to false
  return false;
}

/**
 * Extracts structured payload from a span
 */
export function extractSpanPayload(
  span: ReadableSpan,
  domainAllowList?: DomainRule[],
  globalHeadersAllowList?: string[],
  globalHeadersDenyList?: string[],
  globalCaptureRequestBody?: boolean,
  globalCaptureResponseBody?: boolean,
  headerRedaction?: HeaderRedactionConfig
): SpanPayload | null {
  const attributes = span.attributes;
  const url =
    (attributes["http.url"] as string) || (attributes["url.full"] as string);

  // Get domain-specific rule if available
  const domainRule = url ? getDomainRule(url, domainAllowList) : undefined;

  // Merge global and domain-specific header rules
  const headersAllowList =
    domainRule?.headersAllowList ?? globalHeadersAllowList;
  const headersDenyList = domainRule?.headersDenyList ?? globalHeadersDenyList;

  // Determine if bodies should be captured
  const shouldCaptureReqBody = shouldCaptureBody(
    domainRule,
    globalCaptureRequestBody,
    "request"
  );
  const shouldCaptureRespBody = shouldCaptureBody(
    domainRule,
    globalCaptureResponseBody,
    "response"
  );

  // Extract HTTP headers if available
  let requestHeaders: Record<string, string | string[] | undefined> = {};
  let responseHeaders: Record<string, string | string[] | undefined> = {};

  // First, try to extract flat array format headers (e.g., 'http.request.header.0', 'http.request.header.1')
  // or direct key-value format (e.g., 'http.request.header.date', 'http.request.header.content-type')
  const flatRequestHeaders = extractHeadersFromAttributes(
    attributes,
    "http.request.header"
  );
  const flatResponseHeaders = extractHeadersFromAttributes(
    attributes,
    "http.response.header"
  );

  // Try to get headers from attributes (format may vary by instrumentation)
  const httpRequestHeadersValue = attributes["http.request.header"];
  const httpResponseHeadersValue = attributes["http.response.header"];

  // Type guard: check if value is a record/object with string keys
  const isHeadersRecord = (
    value: unknown
  ): value is Record<string, string | string[] | undefined> => {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).every(
        (v) =>
          typeof v === "string" ||
          (Array.isArray(v) && v.every((item) => typeof item === "string")) ||
          v === undefined
      )
    );
  };

  // Use flat array format if available, otherwise use direct attribute
  if (flatRequestHeaders) {
    requestHeaders = filterHeaders(
      flatRequestHeaders,
      headersAllowList,
      headersDenyList,
      headerRedaction
    );
  } else if (isHeadersRecord(httpRequestHeadersValue)) {
    requestHeaders = filterHeaders(
      httpRequestHeadersValue,
      headersAllowList,
      headersDenyList,
      headerRedaction
    );
  }

  if (flatResponseHeaders) {
    responseHeaders = filterHeaders(
      flatResponseHeaders,
      headersAllowList,
      headersDenyList,
      headerRedaction
    );
  } else if (isHeadersRecord(httpResponseHeadersValue)) {
    responseHeaders = filterHeaders(
      httpResponseHeadersValue,
      headersAllowList,
      headersDenyList,
      headerRedaction
    );
  }

  // Build attributes object
  const extractedAttributes: Record<string, unknown> = {
    ...attributes,
  };

  // Remove flat array format headers (e.g., 'http.request.header.0', 'http.request.header.1', etc.)
  // and direct key-value format headers (e.g., 'http.request.header.date', 'http.request.header.content-type')
  // We'll replace them with the proper key-value format
  for (const key in extractedAttributes) {
    if (
      (key.startsWith("http.request.header.") &&
        key !== "http.request.header") ||
      (key.startsWith("http.response.header.") &&
        key !== "http.response.header")
    ) {
      // Remove both numeric index format and direct key-value format
      delete extractedAttributes[key];
    }
  }

  // Add filtered headers in proper key-value format
  if (Object.keys(requestHeaders).length > 0) {
    extractedAttributes["http.request.header"] = requestHeaders;
  }

  if (Object.keys(responseHeaders).length > 0) {
    extractedAttributes["http.response.header"] = responseHeaders;
  }

  // Remove body attributes if capture is disabled
  if (!shouldCaptureReqBody) {
    delete extractedAttributes["http.request.body"];
  }

  if (!shouldCaptureRespBody) {
    delete extractedAttributes["http.response.body"];
  }

  // Build span payload
  const spanContext = span.spanContext();
  // parentSpanId may not be available in all versions of ReadableSpan
  const parentSpanId =
    "parentSpanId" in span
      ? (span as ReadableSpan & { parentSpanId?: string }).parentSpanId
      : undefined;
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    parentSpanId,
    name: span.name,
    kind: span.kind.toString(),
    startTime: new Date(
      span.startTime[0] * 1000 + span.startTime[1] / 1000000
    ).toISOString(),
    endTime: new Date(
      span.endTime[0] * 1000 + span.endTime[1] / 1000000
    ).toISOString(),
    duration:
      (span.endTime[0] - span.startTime[0]) * 1000 +
      (span.endTime[1] - span.startTime[1]) / 1000000,
    attributes: extractedAttributes,
    status: {
      code: span.status.code.toString(),
      message: span.status.message,
    },
  };
}
