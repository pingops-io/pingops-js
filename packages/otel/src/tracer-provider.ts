/**
 * Tracer Provider with global state and isolated TracerProvider architecture
 *
 * This module provides an isolated TracerProvider that shares the same
 * span processors (like PingopsSpanProcessor) with the main OpenTelemetry SDK.
 * This ensures manual spans created via startSpan are properly processed.
 *
 * Architecture follows Langfuse's pattern with global state management.
 */

import type { TracerProvider } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { createLogger } from "@pingops/core";

/**
 * Global symbol for PingOps state
 */
const PINGOPS_GLOBAL_SYMBOL = Symbol.for("pingops");

/**
 * Logger instance for tracer provider
 */
const logger = createLogger("[PingOps TracerProvider]");

/**
 * Global state interface
 */
type PingopsGlobalState = {
  isolatedTracerProvider: TracerProvider | null;
};

/**
 * Creates initial global state
 */
function createState(): PingopsGlobalState {
  return {
    isolatedTracerProvider: null,
  };
}

/**
 * Interface for globalThis with PingOps state
 */
interface GlobalThis {
  [PINGOPS_GLOBAL_SYMBOL]?: PingopsGlobalState;
}

/**
 * Gets the global state, creating it if it doesn't exist
 */
function getGlobalState(): PingopsGlobalState {
  const initialState = createState();

  try {
    const g = globalThis as typeof globalThis & GlobalThis;

    if (typeof g !== "object" || g === null) {
      // Fallback if globalThis is not available
      logger.warn("globalThis is not available, using fallback state");
      return initialState;
    }

    if (!g[PINGOPS_GLOBAL_SYMBOL]) {
      logger.debug("Creating new global state");
      Object.defineProperty(g, PINGOPS_GLOBAL_SYMBOL, {
        value: initialState,
        writable: false, // lock the slot (not the contents)
        configurable: false,
        enumerable: false,
      });
    } else {
      logger.debug("Retrieved existing global state");
    }

    return g[PINGOPS_GLOBAL_SYMBOL]!;
  } catch (err) {
    logger.error(
      "Failed to access global state:",
      err instanceof Error ? err.message : String(err)
    );
    // Fallback on error
    return initialState;
  }
}

/**
 * Sets an isolated TracerProvider for PingOps tracing operations.
 *
 * This allows PingOps to use its own TracerProvider instance, separate from
 * the global OpenTelemetry TracerProvider. This is useful for avoiding conflicts
 * with other OpenTelemetry instrumentation in the application.
 *
 * @param provider - The TracerProvider instance to use, or null to clear the isolated provider
 * @public
 */
export function setPingopsTracerProvider(
  provider: TracerProvider | null
): void {
  const state = getGlobalState();
  const hadProvider = state.isolatedTracerProvider !== null;

  state.isolatedTracerProvider = provider;

  if (provider) {
    logger.info("Set isolated TracerProvider", {
      hadPrevious: hadProvider,
      providerType: provider.constructor.name,
    });
  } else {
    logger.info("Cleared isolated TracerProvider", {
      hadPrevious: hadProvider,
    });
  }
}

/**
 * Gets the TracerProvider for PingOps tracing operations.
 *
 * Returns the isolated TracerProvider if one has been set via setPingopsTracerProvider(),
 * otherwise falls back to the global OpenTelemetry TracerProvider.
 *
 * @returns The TracerProvider instance to use for PingOps tracing
 * @public
 */
export function getPingopsTracerProvider(): TracerProvider {
  const { isolatedTracerProvider } = getGlobalState();

  if (isolatedTracerProvider) {
    logger.debug("Using isolated TracerProvider", {
      providerType: isolatedTracerProvider.constructor.name,
    });
    return isolatedTracerProvider;
  }

  const globalProvider = trace.getTracerProvider();
  logger.debug("Using global TracerProvider", {
    providerType: globalProvider.constructor.name,
  });
  return globalProvider;
}

/**
 * Initializes the isolated TracerProvider with the given span processors
 *
 * This creates a separate TracerProvider that shares the same span processors
 * (like PingopsSpanProcessor) with the main SDK. This ensures manual spans
 * are processed correctly.
 *
 * @param spanProcessors - Array of span processors to use (e.g., PingopsSpanProcessor)
 * @param serviceName - Service name for resource attributes
 * @deprecated Use setPingopsTracerProvider instead
 */
export function initializeTracerProvider(
  spanProcessors: SpanProcessor[],
  serviceName: string
): void {
  logger.info("Initializing TracerProvider", {
    serviceName,
    spanProcessorCount: spanProcessors.length,
  });

  // Create resource with service name
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  });
  logger.debug("Created resource", { serviceName });

  // In version 2.2.0, span processors are passed in the constructor
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors,
  });
  logger.debug("Created NodeTracerProvider", {
    spanProcessorCount: spanProcessors.length,
  });

  // Register the provider globally
  tracerProvider.register();
  logger.info("Registered TracerProvider globally");

  // Set it in global state
  setPingopsTracerProvider(tracerProvider);
  logger.info("TracerProvider initialization complete");
}

/**
 * Gets the isolated TracerProvider instance
 *
 * @returns The TracerProvider instance, or null if not initialized
 * @deprecated Use getPingopsTracerProvider instead
 */
export function getTracerProvider(): NodeTracerProvider | null {
  const provider = getPingopsTracerProvider();
  return provider instanceof NodeTracerProvider ? provider : null;
}

/**
 * Shuts down the TracerProvider and flushes remaining spans
 */
export async function shutdownTracerProvider(): Promise<void> {
  logger.info("Shutting down TracerProvider");
  const provider = getPingopsTracerProvider();

  // Check if provider has shutdown method (NodeTracerProvider and compatible providers)
  const providerWithShutdown = provider as TracerProvider & {
    shutdown?: () => Promise<void>;
  };
  if (
    providerWithShutdown &&
    typeof providerWithShutdown.shutdown === "function"
  ) {
    logger.debug("Calling provider.shutdown()");
    try {
      await providerWithShutdown.shutdown();
      logger.info("TracerProvider shutdown complete");
    } catch (error) {
      logger.error(
        "Error during TracerProvider shutdown:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  } else {
    logger.warn("TracerProvider does not have shutdown method, skipping");
  }

  setPingopsTracerProvider(null);
  logger.info("TracerProvider shutdown finished");
}
