/**
 * OpenTelemetry context keys for PingOps
 */

import { createContextKey } from "@opentelemetry/api";

/**
 * Context key for enabling HTTP instrumentation.
 * When set to true, HTTP requests will be automatically instrumented.
 * This allows wrapHttp to control which HTTP calls are captured.
 */
export const PINGOPS_HTTP_ENABLED = createContextKey("pingops-http-enabled");

/**
 * Context key for user ID attribute.
 * Used to propagate user identifier to all spans in the context.
 */
export const PINGOPS_USER_ID = createContextKey("pingops-user-id");

/**
 * Context key for session ID attribute.
 * Used to propagate session identifier to all spans in the context.
 */
export const PINGOPS_SESSION_ID = createContextKey("pingops-session-id");

/**
 * Context key for tags attribute.
 * Used to propagate tags array to all spans in the context.
 */
export const PINGOPS_TAGS = createContextKey("pingops-tags");

/**
 * Context key for metadata attribute.
 * Used to propagate metadata object to all spans in the context.
 */
export const PINGOPS_METADATA = createContextKey("pingops-metadata");
