/**
 * HTTP instrumentation for OpenTelemetry
 */

import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { context } from "@opentelemetry/api";
import { PINGOPS_HTTP_ENABLED } from "@pingops/core";
import type { Span } from "@opentelemetry/api";
import type { IncomingMessage, ClientRequest, ServerResponse } from "http";

/**
 * Creates an HTTP instrumentation instance
 *
 * @param isGlobalInstrumentationEnabled - Function that checks if global instrumentation is enabled
 * @returns HttpInstrumentation instance
 */
export function createHttpInstrumentation(
  isGlobalInstrumentationEnabled: () => boolean
): HttpInstrumentation {
  return new HttpInstrumentation({
    ignoreIncomingRequestHook: () => true, // Only instrument outgoing requests
    ignoreOutgoingRequestHook: () => {
      // If global instrumentation is enabled, instrument all outgoing requests
      if (isGlobalInstrumentationEnabled()) {
        return false;
      }
      // If global instrumentation is NOT enabled, only instrument when PINGOPS_HTTP_ENABLED is true
      return context.active().getValue(PINGOPS_HTTP_ENABLED) !== true;
    },
    requestHook: (span: Span, request: ClientRequest | IncomingMessage) => {
      const headers = (request as IncomingMessage).headers;

      for (const [key, value] of Object.entries(headers)) {
        span.setAttribute(
          `http.request.header.${key.toLowerCase()}`,
          Array.isArray(value) ? value.join(",") : String(value)
        );
      }
    },
    responseHook: (span: Span, response: IncomingMessage | ServerResponse) => {
      const headers = (response as IncomingMessage).headers;
      for (const [key, value] of Object.entries(headers)) {
        span.setAttribute(
          `http.response.header.${key.toLowerCase()}`,
          Array.isArray(value) ? value.join(",") : String(value)
        );
      }
    },
  });
}
