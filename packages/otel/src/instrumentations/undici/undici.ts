/**
 * Undici instrumentation for OpenTelemetry
 */

import { UndiciInstrumentation } from "./pingops-undici";
import { context } from "@opentelemetry/api";
import { PINGOPS_HTTP_ENABLED } from "@pingops/core";
import { getGlobalConfig } from "../../config-store";

/**
 * Creates an Undici instrumentation instance
 *
 * @param isGlobalInstrumentationEnabled - Function that checks if global instrumentation is enabled
 * @returns UndiciInstrumentation instance
 */
export function createUndiciInstrumentation(
  isGlobalInstrumentationEnabled: () => boolean
): UndiciInstrumentation {
  const globalConfig = getGlobalConfig();

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
    maxRequestBodySize: globalConfig?.maxRequestBodySize,
    maxResponseBodySize: globalConfig?.maxResponseBodySize,
  });
}
