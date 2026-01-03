/**
 * HTTP instrumentation for OpenTelemetry
 */

import { context } from "@opentelemetry/api";
import { PINGOPS_HTTP_ENABLED } from "@pingops/core";
import {
  PingopsHttpInstrumentation,
  type PingopsHttpInstrumentationConfig,
} from "./pingops-http";

/**
 * Creates an HTTP instrumentation instance
 *
 * @param isGlobalInstrumentationEnabled - Function that checks if global instrumentation is enabled
 * @param config - Optional configuration for the instrumentation
 * @returns PingopsHttpInstrumentation instance
 */
export function createHttpInstrumentation(
  isGlobalInstrumentationEnabled: () => boolean,
  config?: Partial<PingopsHttpInstrumentationConfig>
): PingopsHttpInstrumentation {
  return new PingopsHttpInstrumentation({
    ignoreIncomingRequestHook: () => true, // Only instrument outgoing requests
    ignoreOutgoingRequestHook: () => {
      // If global instrumentation is enabled, instrument all outgoing requests
      if (isGlobalInstrumentationEnabled()) {
        return false;
      }
      // If global instrumentation is NOT enabled, only instrument when PINGOPS_HTTP_ENABLED is true
      return context.active().getValue(PINGOPS_HTTP_ENABLED) !== true;
    },
    ...config,
  });
}
