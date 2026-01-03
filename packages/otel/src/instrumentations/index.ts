/**
 * Instrumentation setup for HTTP, fetch, undici, and GenAI
 */

import type { Instrumentation } from "@opentelemetry/instrumentation";
import { createHttpInstrumentation } from "./http/http";
import { createUndiciInstrumentation } from "./undici/undici";

let installed = false;

/**
 * Registers instrumentations for Node.js environment.
 * This function is idempotent and can be called multiple times safely.
 *
 * Instrumentation behavior:
 * - If global instrumentation is enabled: all HTTP requests are instrumented
 * - If global instrumentation is NOT enabled: only requests within wrapHttp blocks are instrumented
 *
 * @param isGlobalInstrumentationEnabled - Function that checks if global instrumentation is enabled
 * @returns Array of Instrumentation instances
 */
export function getInstrumentations(
  isGlobalInstrumentationEnabled: () => boolean
): Instrumentation[] {
  if (installed) {
    return [];
  }

  installed = true;
  return [
    createHttpInstrumentation(isGlobalInstrumentationEnabled),
    createUndiciInstrumentation(isGlobalInstrumentationEnabled),
  ];
}
