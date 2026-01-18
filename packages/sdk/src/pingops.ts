/**
 * PingOps SDK singleton for manual instrumentation
 *
 * Provides initializePingops and shutdownPingops functions.
 * wrapHttp is available from @pingops/core and will auto-initialize
 * from environment variables if needed.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { PingopsProcessorConfig } from "@pingops/otel";
import {
  setPingopsTracerProvider,
  shutdownTracerProvider,
  PingopsSpanProcessor,
} from "@pingops/otel";
import { createLogger } from "@pingops/core";
import { loadConfigFromFile, mergeConfigWithEnv } from "./config-loader";
import {
  setSdkInitialized,
  isGlobalInstrumentationEnabled,
} from "./init-state";
import {
  wrapHttp as coreWrapHttp,
  type WrapHttpAttributes,
} from "@pingops/core";
import { getPingopsTracerProvider } from "@pingops/otel";
import { getInstrumentations } from "@pingops/otel";

const initLogger = createLogger("[PingOps Initialize]");
const logger = createLogger("[PingOps Pingops]");

let sdkInstance: NodeSDK | null = null;
let isSdkInitializedFlag = false;

/**
 * Global state to track initialization
 */
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initializes PingOps SDK
 *
 * This function:
 * 1. Creates an OpenTelemetry NodeSDK instance
 * 2. Configures Resource with service.name
 * 3. Registers PingopsSpanProcessor
 * 4. Enables HTTP/fetch/GenAI instrumentation
 * 5. Starts the SDK
 *
 * @param config - Configuration object, config file path, or config file wrapper
 * @param explicit - Whether this is an explicit call (default: true).
 *                   Set to false when called internally by wrapHttp auto-initialization.
 */
export function initializePingops(
  config: PingopsProcessorConfig,
  explicit?: boolean
): void;
export function initializePingops(
  configFilePath: string,
  explicit?: boolean
): void;
export function initializePingops(
  config: { configFile: string },
  explicit?: boolean
): void;
export function initializePingops(
  config:
    | PingopsProcessorConfig
    | string
    | {
        configFile: string;
      },
  explicit: boolean = true
): void {
  const resolvedConfig: PingopsProcessorConfig =
    typeof config === "string"
      ? resolveConfigFromFile(config)
      : "configFile" in config
        ? resolveConfigFromFile(config.configFile)
        : config;

  if (isSdkInitializedFlag) {
    if (resolvedConfig.debug) {
      initLogger.warn("[PingOps] SDK already initialized, skipping");
    }
    return;
  }

  // Create resource with service name
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: resolvedConfig.serviceName,
  });

  const processor = new PingopsSpanProcessor(resolvedConfig);
  const instrumentations = getInstrumentations(isGlobalInstrumentationEnabled);

  // Node.js SDK
  const nodeSdk = new NodeSDK({
    resource,
    spanProcessors: [processor],
    instrumentations,
  });

  nodeSdk.start();
  sdkInstance = nodeSdk;

  // Mark SDK as initialized
  isSdkInitializedFlag = true;

  // Only enable global instrumentation if this was an explicit call
  // If called via wrapHttp auto-initialization, global instrumentation stays disabled
  setSdkInitialized(explicit);

  // Initialize isolated TracerProvider for manual spans AFTER NodeSDK starts
  // This ensures manual spans created via startSpan are processed by the same processor
  // We register it after NodeSDK so it takes precedence as the global provider
  try {
    // In version 2.2.0, span processors are passed in the constructor
    const isolatedProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [processor],
    });

    // Register the provider globally
    isolatedProvider.register();

    // Set it in global state
    setPingopsTracerProvider(isolatedProvider);
  } catch (error) {
    if (resolvedConfig.debug) {
      initLogger.error(
        "[PingOps] Failed to create isolated TracerProvider:",
        error instanceof Error ? error.message : String(error)
      );
    }
    // Continue without isolated provider - manual spans will use global provider
  }

  if (resolvedConfig.debug) {
    initLogger.info("[PingOps] SDK initialized");
  }
}

function resolveConfigFromFile(configFilePath: string): PingopsProcessorConfig {
  const fileConfig = loadConfigFromFile(configFilePath);
  const mergedConfig = mergeConfigWithEnv(fileConfig);

  if (!mergedConfig.baseUrl || !mergedConfig.serviceName) {
    const missing = [
      !mergedConfig.baseUrl && "baseUrl (or PINGOPS_BASE_URL)",
      !mergedConfig.serviceName && "serviceName (or PINGOPS_SERVICE_NAME)",
    ].filter(Boolean);

    throw new Error(
      `initializePingops(configFile) requires ${missing.join(" and ")}. ` +
        `Provide them in the config file or via environment variables.`
    );
  }

  return mergedConfig as PingopsProcessorConfig;
}

/**
 * Shuts down the SDK and flushes remaining spans
 */
export async function shutdownPingops(): Promise<void> {
  // Shutdown isolated TracerProvider first
  await shutdownTracerProvider();

  if (!sdkInstance) {
    return;
  }

  await sdkInstance.shutdown();
  sdkInstance = null;
  isSdkInitializedFlag = false;
  setSdkInitialized(false);
}

/**
 * Checks if the SDK is already initialized by checking if a NodeTracerProvider is available
 */
function isSdkInitialized(): boolean {
  try {
    const provider = getPingopsTracerProvider();
    // If we have a NodeTracerProvider (not the default NoOpTracerProvider), SDK is initialized
    const initialized = provider instanceof NodeTracerProvider;
    logger.debug("Checked SDK initialization status", {
      initialized,
      providerType: provider.constructor.name,
    });
    return initialized;
  } catch (error) {
    logger.debug("Error checking SDK initialization status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Auto-initializes the SDK from environment variables if not already initialized
 */
async function ensureInitialized(): Promise<void> {
  // Check if SDK is already initialized (e.g., by calling initializePingops directly)
  if (isSdkInitialized()) {
    logger.debug("SDK already initialized, skipping auto-initialization");
    isInitialized = true;
    return;
  }

  if (isInitialized) {
    logger.debug("SDK initialization flag already set, skipping");
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    logger.debug("SDK initialization already in progress, waiting...");
    return initializationPromise;
  }

  // Start initialization
  logger.info("Starting SDK auto-initialization from environment variables");
  initializationPromise = Promise.resolve().then(() => {
    const apiKey = process.env.PINGOPS_API_KEY;
    const baseUrl = process.env.PINGOPS_BASE_URL;
    const serviceName = process.env.PINGOPS_SERVICE_NAME;
    const debug = process.env.PINGOPS_DEBUG === "true";

    logger.debug("Reading environment variables", {
      hasApiKey: !!apiKey,
      hasBaseUrl: !!baseUrl,
      hasServiceName: !!serviceName,
      debug,
    });

    if (!apiKey || !baseUrl || !serviceName) {
      const missing = [
        !apiKey && "PINGOPS_API_KEY",
        !baseUrl && "PINGOPS_BASE_URL",
        !serviceName && "PINGOPS_SERVICE_NAME",
      ].filter(Boolean);

      logger.error(
        "Missing required environment variables for auto-initialization",
        {
          missing,
        }
      );

      throw new Error(
        `PingOps SDK auto-initialization requires PINGOPS_API_KEY, PINGOPS_BASE_URL, and PINGOPS_SERVICE_NAME environment variables. Missing: ${missing.join(", ")}`
      );
    }

    const config: PingopsProcessorConfig = {
      apiKey,
      baseUrl,
      serviceName,
      debug,
    };

    logger.info("Initializing SDK with config", {
      baseUrl,
      serviceName,
      debug,
    });

    // Call initializePingops with explicit=false since this is auto-initialization
    initializePingops(config, false);
    isInitialized = true;

    logger.info("SDK auto-initialization completed successfully");
  });

  try {
    await initializationPromise;
  } catch (error) {
    logger.error("SDK auto-initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    initializationPromise = null;
  }
}

/**
 * Wraps a function to set attributes on HTTP spans created within the wrapped block.
 *
 * This function sets attributes (userId, sessionId, tags, metadata) in the OpenTelemetry
 * context, which are automatically propagated to all spans created within the wrapped function.
 *
 * Instrumentation behavior:
 * - If `initializePingops` was called: All HTTP requests are instrumented by default.
 *   `wrapHttp` only adds attributes to spans created within the wrapped block.
 * - If `initializePingops` was NOT called: Only HTTP requests within `wrapHttp` blocks
 *   are instrumented. Requests outside `wrapHttp` are not instrumented.
 *
 * @param options - Options including attributes to propagate to spans
 * @param fn - Function to execute within the attribute context
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * import { wrapHttp } from '@pingops/sdk';
 *
 * // Scenario 1: initializePingops was called
 * initializePingops({ ... });
 *
 * // All HTTP requests are instrumented, but this block adds attributes
 * const result = await wrapHttp({
 *   attributes: {
 *     userId: 'user-123',
 *     sessionId: 'session-456',
 *     tags: ['production', 'api'],
 *     metadata: { environment: 'prod', version: '1.0.0' }
 *   }
 * }, async () => {
 *   // This HTTP request will be instrumented AND have the attributes set above
 *   const response = await fetch('https://api.example.com/users/123');
 *   return response.json();
 * });
 *
 * // HTTP requests outside wrapHttp are still instrumented, just without the attributes
 * const otherResponse = await fetch('https://api.example.com/other');
 *
 * // Scenario 2: initializePingops was NOT called
 * // Only requests within wrapHttp are instrumented
 * await wrapHttp({
 *   attributes: { userId: 'user-123' }
 * }, async () => {
 *   // This request IS instrumented
 *   return fetch('https://api.example.com/data');
 * });
 *
 * // This request is NOT instrumented (outside wrapHttp)
 * await fetch('https://api.example.com/other');
 * ```
 */
export function wrapHttp<T>(
  options: { attributes?: WrapHttpAttributes },
  fn: () => T | Promise<T>
): T | Promise<T> {
  return coreWrapHttp(
    {
      ...options,
      checkInitialized: isSdkInitialized,
      isGlobalInstrumentationEnabled: isGlobalInstrumentationEnabled,
      ensureInitialized: ensureInitialized,
    },
    fn
  );
}
