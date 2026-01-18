/**
 * Configuration loader for reading PingOps config from JSON/YAML files
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { PingopsProcessorConfig } from "@pingops/otel";

/**
 * Loads configuration from a JSON or YAML file
 *
 * @param filePath - Path to the config file (JSON or YAML)
 * @returns Parsed configuration object
 * @throws Error if file cannot be read or parsed
 */
export function loadConfigFromFile(
  filePath: string
): Partial<PingopsProcessorConfig> {
  const resolvedPath = resolve(filePath);
  const fileContent = readFileSync(resolvedPath, "utf-8");

  const ext = resolvedPath.toLowerCase();
  if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
    return (loadYaml(fileContent) as Partial<PingopsProcessorConfig>) || {};
  } else if (ext.endsWith(".json")) {
    return JSON.parse(fileContent) as Partial<PingopsProcessorConfig>;
  } else {
    // Try to parse as JSON first, then YAML
    try {
      return JSON.parse(fileContent) as Partial<PingopsProcessorConfig>;
    } catch {
      return (loadYaml(fileContent) as Partial<PingopsProcessorConfig>) || {};
    }
  }
}

/**
 * Merges configuration from file and environment variables.
 * Environment variables take precedence over file config.
 *
 * @param fileConfig - Configuration loaded from file
 * @returns Merged configuration with env vars taking precedence
 */
export function mergeConfigWithEnv(
  fileConfig: Partial<PingopsProcessorConfig>
): Partial<PingopsProcessorConfig> {
  const envConfig: Partial<PingopsProcessorConfig> = {};

  // Read from environment variables
  if (process.env.PINGOPS_API_KEY) {
    envConfig.apiKey = process.env.PINGOPS_API_KEY;
  }
  if (process.env.PINGOPS_BASE_URL) {
    envConfig.baseUrl = process.env.PINGOPS_BASE_URL;
  }
  if (process.env.PINGOPS_SERVICE_NAME) {
    envConfig.serviceName = process.env.PINGOPS_SERVICE_NAME;
  }
  if (process.env.PINGOPS_DEBUG) {
    envConfig.debug = process.env.PINGOPS_DEBUG === "true";
  }
  if (process.env.PINGOPS_BATCH_SIZE) {
    envConfig.batchSize = parseInt(process.env.PINGOPS_BATCH_SIZE, 10);
  }
  if (process.env.PINGOPS_BATCH_TIMEOUT) {
    envConfig.batchTimeout = parseInt(process.env.PINGOPS_BATCH_TIMEOUT, 10);
  }
  if (process.env.PINGOPS_EXPORT_MODE) {
    envConfig.exportMode = process.env.PINGOPS_EXPORT_MODE as
      | "batched"
      | "immediate";
  }

  // Merge: env vars override file config
  return {
    ...fileConfig,
    ...envConfig,
  };
}
