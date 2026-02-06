import { ROOT_CONTEXT, type Context } from "@opentelemetry/api";
import { isTracingSuppressed } from "@opentelemetry/core";
import { createLogger } from "@pingops/core";
import { getGlobalConfig } from "../config-store";

const logger = createLogger("[PingOps SuppressionGuard]");
let hasLoggedSuppressionLeakWarning = false;

function normalizeUrl(url: string): string | null {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function isExporterRequestUrl(requestUrl?: string): boolean {
  if (!requestUrl) {
    return false;
  }

  const exporterUrl = getGlobalConfig()?.exportTraceUrl;
  if (!exporterUrl) {
    return false;
  }

  const normalizedRequestUrl = normalizeUrl(requestUrl);
  const normalizedExporterUrl = normalizeUrl(exporterUrl);
  if (!normalizedRequestUrl || !normalizedExporterUrl) {
    return false;
  }

  return normalizedRequestUrl.startsWith(normalizedExporterUrl);
}

/**
 * Returns a context for outbound span creation that neutralizes leaked suppression
 * for user traffic while preserving suppression for exporter requests.
 */
export function resolveOutboundSpanParentContext(
  activeContext: Context,
  requestUrl?: string
): Context {
  if (!isTracingSuppressed(activeContext)) {
    return activeContext;
  }

  if (isExporterRequestUrl(requestUrl)) {
    return activeContext;
  }

  if (!hasLoggedSuppressionLeakWarning) {
    logger.warn(
      "Detected suppressed context for outbound user request; running instrumentation on ROOT_CONTEXT to prevent Noop spans from suppression leakage"
    );
    hasLoggedSuppressionLeakWarning = true;
  } else {
    logger.debug(
      "Suppressed context detected for outbound user request; using ROOT_CONTEXT"
    );
  }

  return ROOT_CONTEXT;
}
