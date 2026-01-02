/**
 * wrapHttp - Wraps a function to set attributes on HTTP spans created within the wrapped block.
 *
 * This function sets attributes (userId, sessionId, tags, metadata) in the OpenTelemetry
 * context, which are automatically propagated to all spans created within the wrapped function.
 *
 * Instrumentation behavior:
 * - If `initializePingops` was called: All HTTP requests are instrumented by default.
 *   `wrapHttp` only adds attributes to spans created within the wrapped block.
 * - If `initializePingops` was NOT called: Only HTTP requests within `wrapHttp` blocks
 *   are instrumented. Requests outside `wrapHttp` are not instrumented.
 */

import { context } from "@opentelemetry/api";
import { createLogger } from "./logger";
import {
  PINGOPS_HTTP_ENABLED,
  PINGOPS_USER_ID,
  PINGOPS_SESSION_ID,
  PINGOPS_TAGS,
  PINGOPS_METADATA,
} from "./context-keys";
import type { WrapHttpAttributes } from "./types";

const logger = createLogger("[PingOps wrapHttp]");

/**
 * Options for wrapHttp function
 */
export interface WrapHttpOptions {
  attributes?: WrapHttpAttributes;
  /**
   * Callback to check if SDK is initialized.
   * Required to determine if global instrumentation is enabled.
   */
  checkInitialized: () => boolean;
  /**
   * Callback to check if global instrumentation is enabled.
   * Required to determine instrumentation behavior.
   */
  isGlobalInstrumentationEnabled: () => boolean;
  /**
   * Optional callback to ensure SDK is initialized (auto-initialization).
   * If not provided, wrapHttp will try to auto-initialize from environment variables.
   */
  ensureInitialized?: () => Promise<void>;
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
 * Note: This is the low-level API. For a simpler API with automatic setup,
 * use `wrapHttp` from `@pingops/sdk` instead.
 *
 * @param options - Options including attributes and required callbacks
 * @param fn - Function to execute within the attribute context
 * @returns The result of the function
 */
export function wrapHttp<T>(
  options: WrapHttpOptions,
  fn: () => T | Promise<T>
): T | Promise<T> {
  logger.debug("wrapHttp called", {
    hasAttributes: !!options.attributes,
    hasUserId: !!options.attributes?.userId,
    hasSessionId: !!options.attributes?.sessionId,
    hasTags: !!options.attributes?.tags,
    hasMetadata: !!options.attributes?.metadata,
  });

  // Normalize options - if just attributes provided, it means callbacks are required
  // This is a type error at compile time, but we handle it gracefully
  const normalizedOptions: WrapHttpOptions =
    "checkInitialized" in options && "isGlobalInstrumentationEnabled" in options
      ? options
      : (() => {
          throw new Error(
            "wrapHttp requires checkInitialized and isGlobalInstrumentationEnabled callbacks. Use wrapHttp from @pingops/sdk for automatic setup."
          );
        })();

  const { checkInitialized, ensureInitialized } = normalizedOptions;

  // Ensure SDK is initialized so that span processor can extract attributes
  // If already initialized, execute synchronously
  if (checkInitialized()) {
    logger.debug("SDK already initialized, executing wrapHttp synchronously");
    return executeWrapHttpWithContext(normalizedOptions, fn);
  }

  // If not initialized, we need to initialize first (async)
  if (ensureInitialized) {
    logger.debug(
      "SDK not initialized, using provided ensureInitialized callback"
    );
    return ensureInitialized()
      .then(() => {
        logger.debug("SDK initialized, executing wrapHttp");
        return executeWrapHttpWithContext(normalizedOptions, fn);
      })
      .catch((error) => {
        logger.error("Failed to initialize SDK for wrapHttp", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });
  }

  // No ensureInitialized callback provided, execute without initialization
  logger.debug(
    "SDK not initialized and no ensureInitialized callback provided, executing wrapHttp"
  );
  return executeWrapHttpWithContext(normalizedOptions, fn);
}

function executeWrapHttpWithContext<T>(
  options: WrapHttpOptions,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const { attributes, isGlobalInstrumentationEnabled } = options;
  const globalInstrumentationEnabled = isGlobalInstrumentationEnabled();

  logger.debug("Executing wrapHttp context", {
    hasAttributes: !!attributes,
    globalInstrumentationEnabled,
  });

  const activeContext = context.active();

  // If global instrumentation is not enabled, enable HTTP instrumentation
  // for this block only. If it's enabled, all requests are already instrumented.
  let contextWithAttributes = activeContext;
  if (!globalInstrumentationEnabled) {
    contextWithAttributes = contextWithAttributes.setValue(
      PINGOPS_HTTP_ENABLED,
      true
    );
  }

  // Set attributes in context if provided
  // These will be propagated to all spans created within the wrapped function
  if (attributes) {
    if (attributes.userId !== undefined) {
      contextWithAttributes = contextWithAttributes.setValue(
        PINGOPS_USER_ID,
        attributes.userId
      );
    }
    if (attributes.sessionId !== undefined) {
      contextWithAttributes = contextWithAttributes.setValue(
        PINGOPS_SESSION_ID,
        attributes.sessionId
      );
    }
    if (attributes.tags !== undefined) {
      contextWithAttributes = contextWithAttributes.setValue(
        PINGOPS_TAGS,
        attributes.tags
      );
    }
    if (attributes.metadata !== undefined) {
      contextWithAttributes = contextWithAttributes.setValue(
        PINGOPS_METADATA,
        attributes.metadata
      );
    }
  }

  // Run user code inside the context with attributes
  return context.with(contextWithAttributes, () => {
    try {
      const result = fn();

      if (result instanceof Promise) {
        return result.catch((err) => {
          logger.error("Error in wrapHttp async execution", {
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        });
      }

      return result;
    } catch (err) {
      logger.error("Error in wrapHttp sync execution", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });
}
