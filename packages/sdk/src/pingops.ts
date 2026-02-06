/**
 * PingOps SDK singleton for manual instrumentation
 *
 * Provides initializePingops, shutdownPingops, startTrace, getActiveTraceId,
 * and getActiveSpanId. startTrace can auto-initialize from environment variables if needed.
 */

import { ROOT_CONTEXT, context, trace } from "@opentelemetry/api";
import { isTracingSuppressed } from "@opentelemetry/core";
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
import {
  createLogger,
  createTraceId,
  uint8ArrayToHex,
  type PingopsTraceAttributes,
} from "@pingops/core";
import {
  PINGOPS_TRACE_ID,
  PINGOPS_USER_ID,
  PINGOPS_SESSION_ID,
  PINGOPS_TAGS,
  PINGOPS_METADATA,
  PINGOPS_CAPTURE_REQUEST_BODY,
  PINGOPS_CAPTURE_RESPONSE_BODY,
} from "@pingops/core";
import { loadConfigFromFile, mergeConfigWithEnv } from "./config-loader";
import { setSdkInitialized } from "./init-state";
import { getPingopsTracerProvider } from "@pingops/otel";
import { getInstrumentations } from "@pingops/otel";

const TRACE_FLAG_SAMPLED = 1;

const initLogger = createLogger("[PingOps Initialize]");
const logger = createLogger("[PingOps Pingops]");

let sdkInstance: NodeSDK | null = null;
let isSdkInitializedFlag = false;

/**
 * Global state to track initialization
 */
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let hasLoggedSuppressedStartTraceWarning = false;

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
 *                   Set to false when called internally by startTrace auto-initialization.
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
  void explicit; // Ignored: SDK always uses global instrumentation
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
  const instrumentations = getInstrumentations();

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

  setSdkInitialized(true);

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
 * Returns the trace ID of the currently active span, if any.
 */
export function getActiveTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

/**
 * Returns the span ID of the currently active span, if any.
 */
export function getActiveSpanId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().spanId;
}

/**
 * Starts a new trace using the PingOps tracer provider and runs the callback within that trace.
 * Sets attributes (traceId, userId, sessionId, tags, metadata, etc.) in context so they are
 * propagated to spans created within the callback.
 *
 * @param options - Options including optional attributes and optional seed for deterministic traceId
 * @param fn - Function to execute within the trace and attribute context
 * @returns Promise resolving to the result of the function
 *
 * @example
 * ```typescript
 * import { startTrace, initializePingops } from '@pingops/sdk';
 *
 * initializePingops({ ... });
 *
 * const result = await startTrace({
 *   attributes: {
 *     userId: 'user-123',
 *     sessionId: 'session-456',
 *     tags: ['production', 'api'],
 *     metadata: { environment: 'prod', version: '1.0.0' }
 *   },
 *   seed: 'request-123' // optional: deterministic traceId from this seed
 * }, async () => {
 *   const response = await fetch('https://api.example.com/users/123');
 *   return response.json();
 * });
 * ```
 */
export async function startTrace<T>(
  options: { attributes?: PingopsTraceAttributes; seed?: string },
  fn: () => T | Promise<T>
): Promise<T> {
  if (!isSdkInitialized()) {
    await ensureInitialized();
  }

  const traceId =
    options.attributes?.traceId ?? (await createTraceId(options?.seed));
  const parentSpanId = uint8ArrayToHex(
    crypto.getRandomValues(new Uint8Array(8))
  );

  const spanContext = {
    traceId,
    spanId: parentSpanId,
    traceFlags: TRACE_FLAG_SAMPLED,
  };

  const activeContext = context.active();
  const traceExecutionBaseContext = isTracingSuppressed(activeContext)
    ? ROOT_CONTEXT
    : activeContext;
  if (traceExecutionBaseContext === ROOT_CONTEXT) {
    if (!hasLoggedSuppressedStartTraceWarning) {
      logger.warn(
        "startTrace detected a suppressed active context and is running on ROOT_CONTEXT to prevent suppression leakage into user outbound instrumentation"
      );
      hasLoggedSuppressedStartTraceWarning = true;
    } else {
      logger.debug(
        "startTrace received a suppressed active context; running trace on ROOT_CONTEXT"
      );
    }
  }
  const contextWithSpanContext = trace.setSpanContext(
    traceExecutionBaseContext,
    spanContext
  );

  const tracer = getPingopsTracerProvider().getTracer("pingops-sdk", "1.0.0");

  return new Promise((resolve, reject) => {
    tracer.startActiveSpan(
      "pingops-trace",
      {},
      contextWithSpanContext,
      (span) => {
        let contextWithAttributes = context.active();
        const attrs = options.attributes;
        if (attrs) {
          contextWithAttributes = setAttributesInContext(
            contextWithAttributes,
            attrs
          );
        }
        contextWithAttributes = contextWithAttributes.setValue(
          PINGOPS_TRACE_ID,
          traceId
        );

        const run = () => fn();

        try {
          const result = context.with(contextWithAttributes, run);
          if (result instanceof Promise) {
            result
              .then((v) => {
                span.end();
                resolve(v);
              })
              .catch((err) => {
                span.end();
                reject(err instanceof Error ? err : new Error(String(err)));
              });
          } else {
            span.end();
            resolve(result);
          }
        } catch (err) {
          span.end();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
  });
}

/**
 * Runs a callback in a context that is guaranteed to be unsuppressed.
 * Useful for task/job boundaries where suppression may have leaked.
 */
export function runUnsuppressed<T>(fn: () => T): T {
  const activeContext = context.active();
  const unsuppressedContext = isTracingSuppressed(activeContext)
    ? ROOT_CONTEXT
    : activeContext;
  return context.with(unsuppressedContext, fn);
}

function setAttributesInContext(
  ctx: ReturnType<typeof context.active>,
  attrs: PingopsTraceAttributes
): ReturnType<typeof context.active> {
  if (attrs.userId !== undefined) {
    ctx = ctx.setValue(PINGOPS_USER_ID, attrs.userId);
  }
  if (attrs.sessionId !== undefined) {
    ctx = ctx.setValue(PINGOPS_SESSION_ID, attrs.sessionId);
  }
  if (attrs.tags !== undefined) {
    ctx = ctx.setValue(PINGOPS_TAGS, attrs.tags);
  }
  if (attrs.metadata !== undefined) {
    ctx = ctx.setValue(PINGOPS_METADATA, attrs.metadata);
  }
  if (attrs.captureRequestBody !== undefined) {
    ctx = ctx.setValue(PINGOPS_CAPTURE_REQUEST_BODY, attrs.captureRequestBody);
  }
  if (attrs.captureResponseBody !== undefined) {
    ctx = ctx.setValue(
      PINGOPS_CAPTURE_RESPONSE_BODY,
      attrs.captureResponseBody
    );
  }
  return ctx;
}
