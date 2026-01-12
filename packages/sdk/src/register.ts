/**
 * @pingops/sdk/register - Auto-instrumentation setup
 *
 * This file automatically initializes PingOps SDK from environment variables when imported.
 *
 * RECOMMENDED: Import this file FIRST in your application (before any HTTP clients):
 *   import '@pingops/sdk/register';
 *   import axios from 'axios';
 *   // ... rest of your code
 *
 * ALTERNATIVE: Use Node.js --require flag (runs before any imports):
 *   node --require @pingops/sdk/register your-app.js
 *
 * Environment variables:
 *   - PINGOPS_API_KEY: Your API key
 *   - PINGOPS_BASE_URL: Base URL for PingOps API (required)
 *   - PINGOPS_SERVICE_NAME: Service name (required)
 *   - PINGOPS_DEBUG: Set to 'true' to enable debug logging
 *   - PINGOPS_BATCH_SIZE: Batch size for span export (optional)
 *   - PINGOPS_BATCH_TIMEOUT: Batch timeout in ms (optional)
 */

import { initializePingops } from "./pingops.js";

// Only auto-initialize if required env vars are present
const baseUrl = process.env.PINGOPS_BASE_URL;
const serviceName = process.env.PINGOPS_SERVICE_NAME;

if (baseUrl && serviceName) {
  initializePingops({
    apiKey: process.env.PINGOPS_API_KEY,
    baseUrl,
    serviceName,
    debug: process.env.PINGOPS_DEBUG === "true",
    // Optional config from env vars
    batchSize: process.env.PINGOPS_BATCH_SIZE
      ? parseInt(process.env.PINGOPS_BATCH_SIZE, 10)
      : undefined,
    batchTimeout: process.env.PINGOPS_BATCH_TIMEOUT
      ? parseInt(process.env.PINGOPS_BATCH_TIMEOUT, 10)
      : undefined,
  });
}
