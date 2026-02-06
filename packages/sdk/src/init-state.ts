/**
 * Shared state for tracking SDK initialization
 * This module exists to avoid circular dependencies between pingops.ts and instrumentation.ts
 */

let isSdkInitializedFlag = false;

/**
 * Returns whether the SDK has been initialized.
 */
export function isSdkInitialized(): boolean {
  return isSdkInitializedFlag;
}

/**
 * Sets the SDK initialization flag.
 * Called by initializePingops when the SDK is initialized.
 */
export function setSdkInitialized(initialized: boolean): void {
  isSdkInitializedFlag = initialized;
}
