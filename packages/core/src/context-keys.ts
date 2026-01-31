/**
 * OpenTelemetry context keys for PingOps
 */

import { createContextKey } from "@opentelemetry/api";

/**
 * Context key for trace ID attribute.
 * Used to propagate trace identifier to all spans in the context.
 */
export const PINGOPS_TRACE_ID = createContextKey("pingops-trace-id");

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

/**
 * Context key for capturing request body.
 * When set, controls whether request bodies should be captured for HTTP spans.
 */
export const PINGOPS_CAPTURE_REQUEST_BODY = createContextKey(
  "pingops-capture-request-body"
);

/**
 * Context key for capturing response body.
 * When set, controls whether response bodies should be captured for HTTP spans.
 */
export const PINGOPS_CAPTURE_RESPONSE_BODY = createContextKey(
  "pingops-capture-response-body"
);
