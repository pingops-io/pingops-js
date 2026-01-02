/**
 * Extracts propagated attributes from OpenTelemetry context
 */

import type { Context } from "@opentelemetry/api";
import {
  PINGOPS_USER_ID,
  PINGOPS_SESSION_ID,
  PINGOPS_TAGS,
  PINGOPS_METADATA,
} from "../context-keys";

/**
 * Extracts propagated attributes from the given context and returns them
 * as span attributes that can be set on a span.
 *
 * @param parentContext - The OpenTelemetry context to extract attributes from
 * @returns Record of attribute key-value pairs to set on spans
 */
export function getPropagatedAttributesFromContext(
  parentContext: Context
): Record<string, string | string[]> {
  const attributes: Record<string, string | string[]> = {};

  // Extract userId
  const userId = parentContext.getValue(PINGOPS_USER_ID);
  if (userId !== undefined && typeof userId === "string") {
    attributes["pingops.user_id"] = userId;
  }

  // Extract sessionId
  const sessionId = parentContext.getValue(PINGOPS_SESSION_ID);
  if (sessionId !== undefined && typeof sessionId === "string") {
    attributes["pingops.session_id"] = sessionId;
  }

  // Extract tags
  const tags = parentContext.getValue(PINGOPS_TAGS);
  if (tags !== undefined && Array.isArray(tags)) {
    attributes["pingops.tags"] = tags;
  }

  // Extract metadata
  const metadata = parentContext.getValue(PINGOPS_METADATA);
  if (
    metadata !== undefined &&
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata)
  ) {
    // Flatten metadata object into span attributes with prefix
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === "string") {
        attributes[`pingops.metadata.${key}`] = value;
      }
    }
  }

  return attributes;
}
