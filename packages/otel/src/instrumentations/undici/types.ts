import type { InstrumentationConfig } from "@opentelemetry/instrumentation";
import type { Attributes, Span } from "@opentelemetry/api";

export interface UndiciRequest {
  origin: string;
  method: string;
  path: string;
  /**
   * Serialized string of headers in the form `name: value\r\n` for v5
   * Array of strings `[key1, value1, key2, value2]`, where values are
   * `string | string[]` for v6
   */
  headers: string | (string | string[])[];
  /**
   * Helper method to add headers (from v6)
   */
  addHeader: (name: string, value: string) => void;
  throwOnError: boolean;
  completed: boolean;
  aborted: boolean;
  idempotent: boolean;
  contentLength: number | null;
  contentType: string | null;
  body: any;
}

export interface UndiciResponse {
  headers: Buffer[];
  statusCode: number;
  statusText: string;
}

export interface IgnoreRequestFunction<T = UndiciRequest> {
  (request: T): boolean;
}

export interface RequestHookFunction<T = UndiciRequest> {
  (span: Span, request: T): void;
}

export interface ResponseHookFunction<
  RequestType = UndiciRequest,
  ResponseType = UndiciResponse,
> {
  (span: Span, info: { request: RequestType; response: ResponseType }): void;
}

export interface StartSpanHookFunction<T = UndiciRequest> {
  (request: T): Attributes;
}

// This package will instrument HTTP requests made through `undici` or  `fetch` global API
// so it seems logical to have similar options than the HTTP instrumentation
export interface UndiciInstrumentationConfig<
  RequestType = UndiciRequest,
  ResponseType = UndiciResponse,
> extends InstrumentationConfig {
  /** Not trace all outgoing requests that matched with custom function */
  ignoreRequestHook?: IgnoreRequestFunction<RequestType>;
  /** Function for adding custom attributes before request is handled */
  requestHook?: RequestHookFunction<RequestType>;
  /** Function called once response headers have been received */
  responseHook?: ResponseHookFunction<RequestType, ResponseType>;
  /** Function for adding custom attributes before a span is started */
  startSpanHook?: StartSpanHookFunction<RequestType>;
  /** Require parent to create span for outgoing requests */
  requireParentforSpans?: boolean;
  /** Map the following HTTP headers to span attributes. */
  headersToSpanAttributes?: {
    requestHeaders?: string[];
    responseHeaders?: string[];
  };
  /**
   * Maximum size of request body to capture in bytes
   * @defaultValue 4096 (4 KB)
   */
  maxRequestBodySize?: number;
  /**
   * Maximum size of response body to capture in bytes
   * @defaultValue 4096 (4 KB)
   */
  maxResponseBodySize?: number;
}

export interface ListenerRecord {
  name: string;
  unsubscribe: () => void;
}

export interface RequestMessage {
  request: UndiciRequest;
}

export interface RequestHeadersMessage {
  request: UndiciRequest;
  socket: any;
}

export interface ResponseHeadersMessage {
  request: UndiciRequest;
  response: UndiciResponse;
}

export interface RequestTrailersMessage {
  request: UndiciRequest;
  response: UndiciResponse;
}

export interface RequestErrorMessage {
  request: UndiciRequest;
  error: Error;
}

export interface RequestBodyChunkSentMessage {
  request: UndiciRequest;
  chunk: Buffer;
}

export interface RequestBodySentMessage {
  request: UndiciRequest;
}

export interface RequestBodyChunkReceivedMessage {
  request: UndiciRequest;
  chunk: Buffer;
}
