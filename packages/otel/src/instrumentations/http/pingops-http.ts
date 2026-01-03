/**
 * Pingops HTTP instrumentation that extends HttpInstrumentation
 * with request/response body capture and network timing metrics
 */

import { ClientRequest, IncomingMessage, ServerResponse } from "http";
import { Span, context } from "@opentelemetry/api";
import {
  HttpInstrumentation,
  HttpInstrumentationConfig,
  HttpRequestCustomAttributeFunction,
  HttpResponseCustomAttributeFunction,
} from "@opentelemetry/instrumentation-http";
import { Socket } from "net";
import {
  PINGOPS_CAPTURE_REQUEST_BODY,
  PINGOPS_CAPTURE_RESPONSE_BODY,
} from "@pingops/core";
import { getGlobalConfig } from "../../config-store";
import type { DomainRule } from "@pingops/core";

// Constants
const DEFAULT_MAX_REQUEST_BODY_SIZE: number = 4 * 1024; // 4 KB
const DEFAULT_MAX_RESPONSE_BODY_SIZE: number = 4 * 1024; // 4 KB
const NETWORK_TIMINGS_PROP_NAME: string = "__networkTimings";

// Semantic attributes
export const PingopsSemanticAttributes = {
  HTTP_REQUEST_BODY: "http.request.body",
  HTTP_RESPONSE_BODY: "http.response.body",
  NETWORK_DNS_LOOKUP_DURATION: "net.dns.lookup.duration",
  NETWORK_TCP_CONNECT_DURATION: "net.tcp.connect.duration",
  NETWORK_TLS_HANDSHAKE_DURATION: "net.tls.handshake.duration",
  NETWORK_TTFB_DURATION: "net.ttfb.duration",
  NETWORK_CONTENT_TRANSFER_DURATION: "net.content.transfer.duration",
};

// Types
export type NetworkTimings = {
  startAt?: number;
  dnsLookupAt?: number;
  tcpConnectionAt?: number;
  tlsHandshakeAt?: number;
  firstByteAt?: number;
  endAt?: number;
};

export interface PingopsInstrumentationConfig {
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

/**
 * Manually flattens a nested object into dot-notation keys
 */
function flatten(obj: Record<string, any>, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Buffer)
      ) {
        // Recursively flatten nested objects
        Object.assign(result, flatten(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
  }

  return result;
}

/**
 * Sets an attribute value on a span, handling various types appropriately
 */
function setAttributeValue(span: Span, attrName: string, attrValue: any): void {
  if (
    typeof attrValue === "string" ||
    typeof attrValue === "number" ||
    typeof attrValue === "boolean"
  ) {
    span.setAttribute(attrName, attrValue);
  } else if (attrValue instanceof Buffer) {
    span.setAttribute(attrName, attrValue.toString("utf8"));
  } else if (typeof attrValue == "object") {
    span.setAttributes(
      flatten({
        [attrName]: attrValue,
      })
    );
  } else if (Array.isArray(attrValue)) {
    // Check whether there is any element
    if (attrValue.length) {
      // Try to resolve array type over first element.
      // Other elements might have different types but this is just best effort solution.
      const firstElement: any = attrValue[0];
      if (
        typeof firstElement === "string" ||
        typeof firstElement === "number" ||
        typeof firstElement === "boolean"
      ) {
        span.setAttribute(attrName, attrValue);
      } else {
        // TODO What should we do with other array types???
      }
    } else {
      span.setAttribute(attrName, attrValue);
    }
  }
  // TODO What should we do with other types???
}

/**
 * Processes network timings and sets them as span attributes (no spans created)
 */
function processNetworkTimings(
  span: Span,
  networkTimings: NetworkTimings
): void {
  // Calculate and set network timing attributes (no spans created)
  if (networkTimings.startAt && networkTimings.dnsLookupAt) {
    span.setAttribute(
      PingopsSemanticAttributes.NETWORK_DNS_LOOKUP_DURATION,
      networkTimings.dnsLookupAt - networkTimings.startAt
    );
  }

  if (networkTimings.dnsLookupAt && networkTimings.tcpConnectionAt) {
    span.setAttribute(
      PingopsSemanticAttributes.NETWORK_TCP_CONNECT_DURATION,
      networkTimings.tcpConnectionAt - networkTimings.dnsLookupAt
    );
  }

  if (networkTimings.tcpConnectionAt && networkTimings.tlsHandshakeAt) {
    span.setAttribute(
      PingopsSemanticAttributes.NETWORK_TLS_HANDSHAKE_DURATION,
      networkTimings.tlsHandshakeAt - networkTimings.tcpConnectionAt
    );
  }

  const startTTFB: number | undefined =
    networkTimings.tlsHandshakeAt || networkTimings.tcpConnectionAt;
  if (networkTimings.firstByteAt && startTTFB) {
    span.setAttribute(
      PingopsSemanticAttributes.NETWORK_TTFB_DURATION,
      networkTimings.firstByteAt - startTTFB
    );
  }

  if (networkTimings.firstByteAt && networkTimings.endAt) {
    span.setAttribute(
      PingopsSemanticAttributes.NETWORK_CONTENT_TRANSFER_DURATION,
      networkTimings.endAt - networkTimings.firstByteAt
    );
  }
}

/**
 * Initializes network timings on a span
 */
function initializeNetworkTimings(span: Span): NetworkTimings {
  const networkTimings: NetworkTimings = {
    startAt: Date.now(),
  };
  Object.defineProperty(span, NETWORK_TIMINGS_PROP_NAME, {
    enumerable: false,
    configurable: true,
    writable: false,
    value: networkTimings,
  });
  return networkTimings;
}

/**
 * Extracts domain from URL
 */
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    const match = url.match(/^(?:https?:\/\/)?([^/]+)/);
    return match ? match[1] : "";
  }
}

/**
 * Gets domain rule configuration for a given URL
 */
function getDomainRule(
  url: string,
  domainAllowList?: DomainRule[]
): DomainRule | undefined {
  if (!domainAllowList) {
    return undefined;
  }

  const domain = extractDomainFromUrl(url);
  for (const rule of domainAllowList) {
    if (
      domain === rule.domain ||
      domain.endsWith(`.${rule.domain}`) ||
      domain === rule.domain.slice(1)
    ) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Determines if request body should be captured based on priority:
 * context > domain rule > global config > default (false)
 */
function shouldCaptureRequestBody(url?: string): boolean {
  const activeContext = context.active();

  // Check context value first (from wrapHttp)
  const contextValue = activeContext.getValue(PINGOPS_CAPTURE_REQUEST_BODY) as
    | boolean
    | undefined;
  if (contextValue !== undefined) {
    return contextValue;
  }

  // Check domain-specific rule
  if (url) {
    const globalConfig = getGlobalConfig();
    const domainRule = getDomainRule(url, globalConfig?.domainAllowList);
    if (domainRule?.captureRequestBody !== undefined) {
      return domainRule.captureRequestBody;
    }
  }

  // Fall back to global config
  const globalConfig = getGlobalConfig();
  if (globalConfig?.captureRequestBody !== undefined) {
    return globalConfig.captureRequestBody;
  }

  // Default to false
  return false;
}

/**
 * Determines if response body should be captured based on priority:
 * context > domain rule > global config > default (false)
 */
function shouldCaptureResponseBody(url?: string): boolean {
  const activeContext = context.active();

  // Check context value first (from wrapHttp)
  const contextValue = activeContext.getValue(PINGOPS_CAPTURE_RESPONSE_BODY) as
    | boolean
    | undefined;
  if (contextValue !== undefined) {
    return contextValue;
  }

  // Check domain-specific rule
  if (url) {
    const globalConfig = getGlobalConfig();
    const domainRule = getDomainRule(url, globalConfig?.domainAllowList);
    if (domainRule?.captureResponseBody !== undefined) {
      return domainRule.captureResponseBody;
    }
  }

  // Fall back to global config
  const globalConfig = getGlobalConfig();
  if (globalConfig?.captureResponseBody !== undefined) {
    return globalConfig.captureResponseBody;
  }

  // Default to false
  return false;
}

/**
 * Captures request body from string or Buffer data
 */
function captureRequestBody(
  span: Span,
  data: string | Buffer,
  maxSize: number,
  semanticAttr: string,
  url?: string
): void {
  // Check if body capture is enabled
  if (!shouldCaptureRequestBody(url)) {
    return;
  }

  if (data.length && data.length <= maxSize) {
    try {
      const requestBody: string =
        typeof data === "string" ? data : data.toString("utf-8");
      if (requestBody) {
        setAttributeValue(span, semanticAttr, requestBody);
      }
    } catch (e) {
      console.error("Error occurred while capturing request body:", e);
    }
  }
}

/**
 * Captures response body from chunks
 */
function captureResponseBody(
  span: Span,
  chunks: Buffer[] | null,
  semanticAttr: string,
  url?: string
): void {
  // Check if body capture is enabled
  if (!shouldCaptureResponseBody(url)) {
    return;
  }

  if (chunks && chunks.length) {
    try {
      const concatedChunks: Buffer = Buffer.concat(chunks);
      const responseBody: string = concatedChunks.toString("utf8");
      if (responseBody) {
        setAttributeValue(span, semanticAttr, responseBody);
      }
    } catch (e) {
      console.error("Error occurred while capturing response body:", e);
    }
  }
}

/**
 * Captures HTTP request headers as span attributes
 */
function captureRequestHeaders(
  span: Span,
  headers: Record<string, string | string[] | undefined>
): void {
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      span.setAttribute(
        `pingops.http.request.header.${key.toLowerCase()}`,
        Array.isArray(value) ? value.join(",") : String(value)
      );
    }
  }
}

/**
 * Captures HTTP response headers as span attributes
 */
function captureResponseHeaders(
  span: Span,
  headers: Record<string, string | string[] | undefined>
): void {
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      span.setAttribute(
        `pingops.http.response.header.${key.toLowerCase()}`,
        Array.isArray(value) ? value.join(",") : String(value)
      );
    }
  }
}

// Re-export semantic attributes for backward compatibility
export const PingopsHttpSemanticAttributes = PingopsSemanticAttributes;

export interface PingopsHttpInstrumentationConfig
  extends HttpInstrumentationConfig, PingopsInstrumentationConfig {}

export class PingopsHttpInstrumentation extends HttpInstrumentation {
  constructor(config?: PingopsHttpInstrumentationConfig) {
    super(config);
    this._config = this._createConfig(config);
  }

  private _createConfig(
    config?: PingopsHttpInstrumentationConfig
  ): PingopsHttpInstrumentationConfig {
    return {
      ...config,
      requestHook: this._createRequestHook(config?.requestHook, config),
      responseHook: this._createResponseHook(config?.responseHook, config),
    };
  }

  private _createRequestHook(
    originalRequestHook?: HttpRequestCustomAttributeFunction,
    config?: PingopsHttpInstrumentationConfig
  ): HttpRequestCustomAttributeFunction {
    return (span: Span, request: ClientRequest | IncomingMessage): void => {
      // Capture request headers
      const headers = (request as IncomingMessage).headers;
      if (headers) {
        captureRequestHeaders(span, headers);
      }
      if (request instanceof ClientRequest) {
        const networkTimings = initializeNetworkTimings(span);

        const maxRequestBodySize: number =
          config?.maxRequestBodySize || DEFAULT_MAX_REQUEST_BODY_SIZE;

        // Extract URL from request
        const url =
          request.path && request.getHeader("host")
            ? `${request.protocol || "http:"}//${request.getHeader("host")}${request.path}`
            : undefined;

        const originalWrite = request.write.bind(request);
        const originalEnd = request.end.bind(request);

        // Capture request body
        request.write = (data: any): boolean => {
          if (typeof data === "string" || data instanceof Buffer) {
            captureRequestBody(
              span,
              data,
              maxRequestBodySize,
              PingopsSemanticAttributes.HTTP_REQUEST_BODY,
              url
            );
          }
          return originalWrite(data);
        };

        request.end = (data: any): ClientRequest => {
          if (typeof data === "string" || data instanceof Buffer) {
            captureRequestBody(
              span,
              data,
              maxRequestBodySize,
              PingopsSemanticAttributes.HTTP_REQUEST_BODY,
              url
            );
          }
          return originalEnd(data);
        };

        // Track network timings
        request.on("socket", (socket: Socket) => {
          socket.on("lookup", (): void => {
            networkTimings.dnsLookupAt = Date.now();
          });
          socket.on("connect", (): void => {
            networkTimings.tcpConnectionAt = Date.now();
          });
          socket.on("secureConnect", (): void => {
            networkTimings.tlsHandshakeAt = Date.now();
          });
        });
      }

      if (originalRequestHook) {
        originalRequestHook(span, request);
      }
    };
  }

  private _createResponseHook(
    originalResponseHook?: HttpResponseCustomAttributeFunction,
    config?: PingopsHttpInstrumentationConfig
  ): HttpResponseCustomAttributeFunction {
    return (span: Span, response: IncomingMessage | ServerResponse): void => {
      // Capture response headers
      const headers = (response as IncomingMessage).headers;
      if (headers) {
        captureResponseHeaders(span, headers);
      }

      if (response instanceof IncomingMessage) {
        const networkTimings: NetworkTimings = (span as any)[
          NETWORK_TIMINGS_PROP_NAME
        ];

        const maxResponseBodySize: number =
          config?.maxResponseBodySize || DEFAULT_MAX_RESPONSE_BODY_SIZE;

        // Extract URL from response (if available via request)
        // Note: We can't easily get URL from IncomingMessage, so we'll rely on
        // domain rules matching based on headers or skip domain-specific checks
        const url = response.url || undefined;

        let chunks: Buffer[] | null = [];
        let totalSize: number = 0;

        // Only capture response body if enabled
        const shouldCapture = shouldCaptureResponseBody(url);

        // Capture response body
        response.prependListener("data", (chunk: any): void => {
          if (!chunk || !shouldCapture) {
            return;
          }
          if (typeof chunk === "string" || chunk instanceof Buffer) {
            totalSize += chunk.length;
            if (chunks && totalSize <= maxResponseBodySize) {
              chunks.push(
                typeof chunk === "string" ? Buffer.from(chunk) : chunk
              );
            } else {
              // No need to capture partial response body
              chunks = null;
            }
          }
        });

        response.prependOnceListener("end", (): void => {
          if (networkTimings) {
            networkTimings.endAt = Date.now();
            processNetworkTimings(span, networkTimings);
          }

          captureResponseBody(
            span,
            chunks,
            PingopsSemanticAttributes.HTTP_RESPONSE_BODY,
            url
          );
        });

        if (networkTimings) {
          response.once("readable", (): void => {
            networkTimings.firstByteAt = Date.now();
          });
        }
      }

      if (originalResponseHook) {
        originalResponseHook(span, response);
      }
    };
  }
}
