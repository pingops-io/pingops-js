/**
 * Global configuration store for PingOps processor
 * Allows instrumentations to access processor configuration without direct coupling
 */

import type { DomainRule } from "@pingops/core";

interface GlobalConfig {
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
  domainAllowList?: DomainRule[];
  maxRequestBodySize?: number;
  maxResponseBodySize?: number;
  exportTraceUrl?: string;
}

let globalConfig: GlobalConfig | null = null;

/**
 * Sets the global processor configuration
 * @param config - Configuration to store
 */
export function setGlobalConfig(config: GlobalConfig): void {
  globalConfig = config;
}

/**
 * Gets the global processor configuration
 * @returns The stored configuration or null if not set
 */
export function getGlobalConfig(): GlobalConfig | null {
  return globalConfig;
}

/**
 * Clears the global configuration (useful for testing)
 */
export function clearGlobalConfig(): void {
  globalConfig = null;
}
