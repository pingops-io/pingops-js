/**
 * Undici instrumentation for OpenTelemetry
 */

import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { context } from "@opentelemetry/api";
import { PINGOPS_HTTP_ENABLED } from "@pingops/core";
import type { Span } from "@opentelemetry/api";

/**
 * Creates an Undici instrumentation instance
 *
 * @param isGlobalInstrumentationEnabled - Function that checks if global instrumentation is enabled
 * @returns UndiciInstrumentation instance
 */
export function createUndiciInstrumentation(
  isGlobalInstrumentationEnabled: () => boolean
): UndiciInstrumentation {
  return new UndiciInstrumentation({
    enabled: true,
    ignoreRequestHook: () => {
      // If global instrumentation is enabled, instrument all requests
      if (isGlobalInstrumentationEnabled()) {
        return false;
      }
      // If global instrumentation is NOT enabled, only instrument when PINGOPS_HTTP_ENABLED is true
      return context.active().getValue(PINGOPS_HTTP_ENABLED) !== true;
    },
    requestHook: (span: Span, request) => {
      const headers = request.headers;

      for (const [key, value] of Object.entries(headers)) {
        span.setAttribute(
          `http.request.header.${key.toLowerCase()}`,
          Array.isArray(value) ? value.join(",") : String(value)
        );
      }
    },
    responseHook: (span: Span, { response }) => {
      const headers = response.headers;
      for (const [key, value] of Object.entries(headers)) {
        span.setAttribute(
          `http.response.header.${key.toLowerCase()}`,
          Array.isArray(value) ? value.join(",") : String(value)
        );
      }
    },
  });
}
