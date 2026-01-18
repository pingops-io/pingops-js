/**
 * @pingops/sdk/register - Auto-instrumentation setup
 *
 * This file automatically initializes PingOps SDK from environment variables or a config file when imported.
 *
 * RECOMMENDED: Import this file FIRST in your application (before any HTTP clients):
 *   import '@pingops/sdk/register';
 *   import axios from 'axios';
 *   // ... rest of your code
 *
 * ALTERNATIVE: Use Node.js --require flag (runs before any imports):
 *   node --require @pingops/sdk/register your-app.js
 *
 * Configuration can be provided via:
 * 1. Config file (JSON or YAML) - Set PINGOPS_CONFIG_FILE environment variable
 * 2. Environment variables (takes precedence over config file)
 *
 * Environment variables:
 *   - PINGOPS_CONFIG_FILE: Path to JSON or YAML config file (optional)
 *   - PINGOPS_API_KEY: Your API key
 *   - PINGOPS_BASE_URL: Base URL for PingOps API (required)
 *   - PINGOPS_SERVICE_NAME: Service name (required)
 *   - PINGOPS_DEBUG: Set to 'true' to enable debug logging
 *   - PINGOPS_BATCH_SIZE: Batch size for span export (optional)
 *   - PINGOPS_BATCH_TIMEOUT: Batch timeout in ms (optional)
 *   - PINGOPS_EXPORT_MODE: Export mode - 'batched' or 'immediate' (optional)
 *
 * Config file format (JSON example):
 *   {
 *     "apiKey": "your-api-key",
 *     "baseUrl": "https://api.pingops.com",
 *     "serviceName": "my-service",
 *     "debug": false,
 *     "batchSize": 50,
 *     "batchTimeout": 5000,
 *     "exportMode": "batched"
 *   }
 *
 * Config file format (YAML example):
 *   apiKey: your-api-key
 *   baseUrl: https://api.pingops.com
 *   serviceName: my-service
 *   debug: false
 *   batchSize: 50
 *   batchTimeout: 5000
 *   exportMode: batched
 */

import { initializePingops } from "./pingops.js";
import { loadConfigFromFile, mergeConfigWithEnv } from "./config-loader.js";

let config: {
  apiKey?: string;
  baseUrl?: string;
  serviceName?: string;
  debug?: boolean;
  batchSize?: number;
  batchTimeout?: number;
  exportMode?: "batched" | "immediate";
} = {};

// Try to load config from file if PINGOPS_CONFIG_FILE is set
const configFilePath = process.env.PINGOPS_CONFIG_FILE;
if (configFilePath) {
  try {
    const fileConfig = loadConfigFromFile(configFilePath);
    config = mergeConfigWithEnv(fileConfig);
  } catch (error) {
    console.error(
      `[PingOps] Failed to load config from file ${configFilePath}:`,
      error instanceof Error ? error.message : String(error)
    );
    // Fall back to environment variables only
    config = mergeConfigWithEnv({});
  }
} else {
  // No config file, use environment variables only
  config = mergeConfigWithEnv({});
}

// Only auto-initialize if required config values are present
const baseUrl = config.baseUrl;
const serviceName = config.serviceName;

if (baseUrl && serviceName) {
  initializePingops({
    apiKey: config.apiKey,
    baseUrl,
    serviceName,
    debug: config.debug,
    batchSize: config.batchSize,
    batchTimeout: config.batchTimeout,
    exportMode: config.exportMode,
  });
}
