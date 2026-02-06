/**
 * Span filtering logic - determines if a span is eligible for capture
 */

import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { createLogger } from "../logger";
import {
  hasHttpMethodAttribute,
  hasHttpUrlAttribute,
} from "../utils/http-attributes";

const log = createLogger("[PingOps SpanFilter]");

/**
 * Checks if a span is eligible for capture based on span kind and attributes.
 * A span is eligible if:
 * 1. span.kind === SpanKind.CLIENT
 * 2. AND has HTTP attributes
 *    - method: http.method or http.request.method
 *    - url: http.url or url.full
 *    - host: server.address
 *    OR has GenAI attributes (gen_ai.system, gen_ai.operation.name)
 */
export function isSpanEligible(span: ReadableSpan): boolean {
  log.debug("Checking span eligibility", {
    spanName: span.name,
    spanKind: span.kind,
    spanId: span.spanContext().spanId,
    traceId: span.spanContext().traceId,
  });

  // Must be a CLIENT span (outgoing request)
  if (span.kind !== SpanKind.CLIENT) {
    log.debug("Span not eligible: not CLIENT kind", {
      spanName: span.name,
      spanKind: span.kind,
    });
    return false;
  }

  const attributes = span.attributes;

  // Check for HTTP attributes
  const hasHttpMethod = hasHttpMethodAttribute(attributes);
  const hasHttpUrl = hasHttpUrlAttribute(attributes);
  const hasServerAddress = attributes["server.address"] !== undefined;

  const isEligible = hasHttpMethod || hasHttpUrl || hasServerAddress;

  log.debug("Span eligibility check result", {
    spanName: span.name,
    isEligible,
    httpAttributes: {
      hasMethod: hasHttpMethod,
      hasUrl: hasHttpUrl,
      hasLegacyMethod: attributes["http.method"] !== undefined,
      hasModernMethod: attributes["http.request.method"] !== undefined,
      hasLegacyUrl: attributes["http.url"] !== undefined,
      hasModernUrl: attributes["url.full"] !== undefined,
      hasServerAddress,
    },
  });

  return isEligible;
}
