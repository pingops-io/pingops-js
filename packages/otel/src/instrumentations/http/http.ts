/**
 * HTTP instrumentation for OpenTelemetry
 */

import {
  PingopsHttpInstrumentation,
  type PingopsHttpInstrumentationConfig,
} from "./pingops-http";
import { getGlobalConfig } from "../../config-store";

/**
 * Creates an HTTP instrumentation instance.
 * All outgoing HTTP requests are instrumented when the SDK is initialized.
 *
 * @param config - Optional configuration for the instrumentation
 * @returns PingopsHttpInstrumentation instance
 */
export function createHttpInstrumentation(
  config?: Partial<PingopsHttpInstrumentationConfig>
): PingopsHttpInstrumentation {
  const globalConfig = getGlobalConfig();

  return new PingopsHttpInstrumentation({
    ignoreIncomingRequestHook: () => true, // Only instrument outgoing requests
    ignoreOutgoingRequestHook: () => false, // Always instrument outgoing requests
    maxRequestBodySize: globalConfig?.maxRequestBodySize,
    maxResponseBodySize: globalConfig?.maxResponseBodySize,
    ...config,
  });
}
