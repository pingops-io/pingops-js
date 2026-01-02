/**
 * Shared state for tracking SDK initialization
 * This module exists to avoid circular dependencies between pingops.ts and instrumentation.ts
 */

let isSdkInitializedFlag = false;

/**
 * Sets the SDK initialization flag.
 * Called by initializePingops when the SDK is initialized.
 */
export function setSdkInitialized(initialized: boolean): void {
  isSdkInitializedFlag = initialized;
}

/**
 * Checks if global instrumentation is enabled.
 * This is used to determine instrumentation behavior:
 * - If true: all HTTP requests are instrumented
 * - If false: only requests within wrapHttp blocks are instrumented
 */
export function isGlobalInstrumentationEnabled(): boolean {
  return isSdkInitializedFlag;
}
