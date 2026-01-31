/**
 * Shared type definitions for PingOps SDK
 */

export interface DomainRule {
  domain: string;
  paths?: string[];
  headersAllowList?: string[];
  headersDenyList?: string[];
  captureRequestBody?: boolean;
  captureResponseBody?: boolean;
}

export interface SpanPayload {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: string;
  endTime: string;
  duration: number;
  attributes: Record<string, unknown>;
  status: {
    code: string;
    message?: string;
  };
}

/**
 * Attributes to propagate to spans (e.g. when starting a trace with startTrace).
 */
export interface PingopsTraceAttributes {
  traceId?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  /**
   * Whether to capture request body for HTTP spans in this context.
   * Takes precedence over domain-specific rules and global config.
   */
  captureRequestBody?: boolean;
  /**
   * Whether to capture response body for HTTP spans in this context.
   * Takes precedence over domain-specific rules and global config.
   */
  captureResponseBody?: boolean;
}
