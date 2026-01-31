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
 * When the SDK is initialized, all HTTP requests are instrumented.
 *
 * @returns Array of Instrumentation instances
 */
export function getInstrumentations(): Instrumentation[] {
  if (installed) {
    return [];
  }

  installed = true;
  return [createHttpInstrumentation(), createUndiciInstrumentation()];
}
