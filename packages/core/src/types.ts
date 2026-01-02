/**
 * Shared type definitions for PingOps SDK
 */

export interface DomainRule {
  domain: string;
  paths?: string[];
  headersAllowList?: string[];
  headersDenyList?: string[];
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
 * Attributes to propagate to HTTP spans
 */
export interface WrapHttpAttributes {
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}
