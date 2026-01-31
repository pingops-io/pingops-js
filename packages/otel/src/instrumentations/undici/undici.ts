/**
 * Undici instrumentation for OpenTelemetry
 */

import { UndiciInstrumentation } from "./pingops-undici";
import { getGlobalConfig } from "../../config-store";

/**
 * Creates an Undici instrumentation instance.
 * All requests are instrumented when the SDK is initialized.
 *
 * @returns UndiciInstrumentation instance
 */
export function createUndiciInstrumentation(): UndiciInstrumentation {
  const globalConfig = getGlobalConfig();

  return new UndiciInstrumentation({
    enabled: true,
    ignoreRequestHook: () => false, // Always instrument requests
    maxRequestBodySize: globalConfig?.maxRequestBodySize,
    maxResponseBodySize: globalConfig?.maxResponseBodySize,
  });
}
