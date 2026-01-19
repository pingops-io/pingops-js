/**
 * PingopsSpanProcessor - OpenTelemetry SpanProcessor implementation
 * Observes finished spans and sends eligible ones to PingOps backend
 *
 * This processor provides:
 * - Automatic filtering of spans (CLIENT spans with HTTP/GenAI attributes only)
 * - Domain and header filtering based on configuration
 * - Batched or immediate export modes using OTLP exporters
 * - Fire-and-forget transport (never blocks application)
 *
 * @example
 * ```typescript
 * import { NodeSDK } from '@opentelemetry/sdk-node';
 * import { PingopsSpanProcessor } from '@pingops/otel';
 *
 * const sdk = new NodeSDK({
 *   spanProcessors: [
 *     new PingopsSpanProcessor({
 *       apiKey: 'your-api-key',
 *       baseUrl: 'https://api.pingops.com',
 *       serviceName: 'my-service',
 *       exportMode: 'batched', // or 'immediate'
 *       domainAllowList: [
 *         { domain: 'api.example.com' }
 *       ]
 *     })
 *   ]
 * });
 *
 * sdk.start();
 * ```
 */

import type {
  SpanProcessor,
  ReadableSpan,
  Span,
} from "@opentelemetry/sdk-trace-base";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { Context, Attributes } from "@opentelemetry/api";
import {
  isSpanEligible,
  shouldCaptureSpan,
  type DomainRule,
  type HeaderRedactionConfig,
  createLogger,
  getPropagatedAttributesFromContext,
  extractSpanPayload,
} from "@pingops/core";
import type { PingopsProcessorConfig } from "./config";
import { setGlobalConfig } from "./config-store";

const logger = createLogger("[PingOps Processor]");

/**
 * Creates a filtered span wrapper that applies header filtering to attributes
 *
 * This wrapper applies both domain-specific and global header filtering:
 * - Uses domain allow list to determine domain-specific header rules
 * - Applies global header allow/deny lists
 * - Filters headers from http.request.header and http.response.header attributes
 *
 * Uses a Proxy to automatically forward all properties and methods to the original span,
 * except for 'attributes' which returns the filtered version. This approach is future-proof
 * and will work with any new methods or properties added to ReadableSpan.
 *
 * This allows us to filter headers before the span is serialized by OTLP exporter
 */
function createFilteredSpan(
  span: ReadableSpan,
  domainAllowList?: DomainRule[],
  globalHeadersAllowList?: string[],
  globalHeadersDenyList?: string[],
  globalCaptureRequestBody?: boolean,
  globalCaptureResponseBody?: boolean,
  headerRedaction?: HeaderRedactionConfig
): ReadableSpan {
  // Use extractSpanPayload to get filtered attributes
  // This handles both domain-specific header rules and global header filtering
  // as well as body capture filtering and header redaction
  const payload = extractSpanPayload(
    span,
    domainAllowList,
    globalHeadersAllowList,
    globalHeadersDenyList,
    globalCaptureRequestBody,
    globalCaptureResponseBody,
    headerRedaction
  );
  const filteredAttributes = (payload?.attributes ??
    span.attributes) as Attributes;
  logger.debug("Payload", { payload });

  // Create a Proxy that intercepts 'attributes' access and forwards everything else
  return new Proxy(span, {
    get(target, prop) {
      // Intercept 'attributes' to return filtered version
      if (prop === "attributes") {
        return filteredAttributes;
      }
      // Forward all other property/method access to the original span
      const value = (target as ReadableSpan & Record<string, unknown>)[
        prop as string
      ];
      // If it's a function, bind it to the original target to preserve 'this' context
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

/**
 * OpenTelemetry span processor for sending spans to PingOps backend.
 *
 * This processor wraps OpenTelemetry's built-in processors (BatchSpanProcessor or SimpleSpanProcessor)
 * and applies filtering before passing spans to the OTLP exporter.
 */
export class PingopsSpanProcessor implements SpanProcessor {
  private processor: SpanProcessor;
  private config: {
    debug: boolean;
    headersAllowList?: string[];
    headersDenyList?: string[];
    domainAllowList?: DomainRule[];
    domainDenyList?: DomainRule[];
    captureRequestBody?: boolean;
    captureResponseBody?: boolean;
    headerRedaction?: HeaderRedactionConfig;
  };

  /**
   * Creates a new PingopsSpanProcessor instance.
   *
   * @param config - Configuration parameters for the processor
   */
  constructor(config: PingopsProcessorConfig) {
    const exportMode = config.exportMode ?? "batched";

    // Get API key from config or environment
    const apiKey = config.apiKey || process.env.PINGOPS_API_KEY || "";

    // Create OTLP exporter pointing to PingOps backend
    const exporter = new OTLPTraceExporter({
      url: `${config.baseUrl}/v1/traces`,
      headers: {
        Authorization: apiKey ? `Bearer ${apiKey}` : "",
        "Content-Type": "application/json",
      },
      timeoutMillis: 5000,
    });

    // Create underlying processor based on export mode
    if (exportMode === "immediate") {
      this.processor = new SimpleSpanProcessor(exporter);
    } else {
      this.processor = new BatchSpanProcessor(exporter, {
        maxExportBatchSize: config.batchSize ?? 50,
        scheduledDelayMillis: config.batchTimeout ?? 5000,
      });
    }

    this.config = {
      debug: config.debug ?? false,
      headersAllowList: config.headersAllowList,
      headersDenyList: config.headersDenyList,
      domainAllowList: config.domainAllowList,
      domainDenyList: config.domainDenyList,
      captureRequestBody: config.captureRequestBody,
      captureResponseBody: config.captureResponseBody,
      headerRedaction: config.headerRedaction,
    };

    // Register global config for instrumentations to access
    setGlobalConfig({
      captureRequestBody: config.captureRequestBody,
      captureResponseBody: config.captureResponseBody,
      domainAllowList: config.domainAllowList,
      maxRequestBodySize: config.maxRequestBodySize,
      maxResponseBodySize: config.maxResponseBodySize,
    });

    logger.info("Initialized PingopsSpanProcessor", {
      baseUrl: config.baseUrl,
      exportMode,
      batchSize: config.batchSize,
      batchTimeout: config.batchTimeout,
      hasDomainAllowList:
        !!config.domainAllowList && config.domainAllowList.length > 0,
      hasDomainDenyList:
        !!config.domainDenyList && config.domainDenyList.length > 0,
      hasHeadersAllowList:
        !!config.headersAllowList && config.headersAllowList.length > 0,
      hasHeadersDenyList:
        !!config.headersDenyList && config.headersDenyList.length > 0,
    });
  }

  /**
   * Called when a span starts - extracts parent attributes from context and adds them to the span
   */
  onStart(span: Span, parentContext: Context): void {
    const spanContext = span.spanContext();
    logger.debug("Span started", {
      spanName: span.name,
      spanId: spanContext.spanId,
      traceId: spanContext.traceId,
    });

    // Extract propagated attributes from context and set them on the span
    const propagatedAttributes =
      getPropagatedAttributesFromContext(parentContext);
    if (Object.keys(propagatedAttributes).length > 0) {
      for (const [key, value] of Object.entries(propagatedAttributes)) {
        // Type guard: value must be string or string[] for OpenTelemetry attributes
        if (typeof value === "string" || Array.isArray(value)) {
          span.setAttribute(key, value);
        }
      }
      logger.debug("Set propagated attributes on span", {
        spanName: span.name,
        attributeKeys: Object.keys(propagatedAttributes),
      });
    }

    this.processor.onStart(span, parentContext);
  }
  /**
   * Called when a span ends. Filters the span and passes it to the underlying processor if eligible.
   *
   * This method:
   * 1. Checks if the span is eligible (CLIENT + HTTP/GenAI attributes)
   * 2. Applies domain filtering (determines if span should be exported)
   * 3. Applies header filtering via FilteredSpan wrapper (domain-specific and global rules)
   * 4. If eligible, passes filtered span to underlying OTLP processor for export
   */
  onEnd(span: ReadableSpan): void {
    const spanContext = span.spanContext();
    logger.debug("Span ended, processing", {
      spanName: span.name,
      spanId: spanContext.spanId,
      traceId: spanContext.traceId,
      spanKind: span.kind,
    });

    try {
      // Step 1: Check if span is eligible (CLIENT + HTTP/GenAI attributes)
      if (!isSpanEligible(span)) {
        logger.debug("Span not eligible, skipping", {
          spanName: span.name,
          spanId: spanContext.spanId,
          reason: "not CLIENT or missing HTTP/GenAI attributes",
        });
        return;
      }

      // Step 2: Extract URL for domain filtering
      const attributes = span.attributes;
      const url =
        (attributes["http.url"] as string) ||
        (attributes["url.full"] as string) ||
        (attributes["server.address"]
          ? `https://${String(attributes["server.address"])}`
          : "");

      logger.debug("Extracted URL for domain filtering", {
        spanName: span.name,
        url,
        hasHttpUrl: !!attributes["http.url"],
        hasUrlFull: !!attributes["url.full"],
        hasServerAddress: !!attributes["server.address"],
      });

      // Step 3: Apply domain filtering
      if (url) {
        const shouldCapture = shouldCaptureSpan(
          url,
          this.config.domainAllowList,
          this.config.domainDenyList
        );

        if (!shouldCapture) {
          logger.info("Span filtered out by domain rules", {
            spanName: span.name,
            spanId: spanContext.spanId,
            url,
          });
          return;
        }
      } else {
        logger.debug("No URL found for domain filtering, proceeding", {
          spanName: span.name,
        });
      }

      // Step 4: Apply filtering (header filtering with domain-specific rules) by wrapping the span
      const filteredSpan = createFilteredSpan(
        span,
        this.config.domainAllowList,
        this.config.headersAllowList,
        this.config.headersDenyList,
        this.config.captureRequestBody,
        this.config.captureResponseBody,
        this.config.headerRedaction
      );

      // Step 5: Span passed all filters, pass filtered span to underlying processor for export
      this.processor.onEnd(filteredSpan);

      logger.info("Span passed all filters and queued for export", {
        spanName: span.name,
        spanId: spanContext.spanId,
        traceId: spanContext.traceId,
        url,
        hasHeaderFiltering: !!(
          this.config.headersAllowList || this.config.headersDenyList
        ),
      });
    } catch (error) {
      // Defensive error handling - never crash the app
      logger.error("Error processing span", {
        spanName: span.name,
        spanId: spanContext.spanId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Forces an immediate flush of all pending spans.
   *
   * @returns Promise that resolves when all pending operations are complete
   */
  public async forceFlush(): Promise<void> {
    logger.info("Force flushing spans");
    try {
      await this.processor.forceFlush();
      logger.info("Force flush complete");
    } catch (error) {
      logger.error("Error during force flush", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gracefully shuts down the processor, ensuring all pending operations are completed.
   *
   * @returns Promise that resolves when shutdown is complete
   */
  public async shutdown(): Promise<void> {
    logger.info("Shutting down processor");
    try {
      await this.processor.shutdown();
      logger.info("Processor shutdown complete");
    } catch (error) {
      logger.error("Error during processor shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
