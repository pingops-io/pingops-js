/**
 * Configuration types for PingopsSpanProcessor
 */

import type { DomainRule } from "@pingops/core";

/**
 * Span export mode to use.
 *
 * - **batched**: Recommended for production environments with long-running processes.
 *   Spans are batched and exported in groups for optimal performance.
 * - **immediate**: Recommended for short-lived environments such as serverless functions.
 *   Spans are exported immediately to prevent data loss when the process terminates / is frozen.
 *
 * @defaultValue "batched"
 */
export type PingopsExportMode = "immediate" | "batched";

/**
 * Configuration parameters for the PingopsSpanProcessor.
 */
export interface PingopsProcessorConfig {
  /**
   * API key for authentication. Can also be set via PINGOPS_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * PingOps backend base URL (required).
   */
  baseUrl: string;

  /**
   * Enable debug logging.
   * @defaultValue false
   */
  debug?: boolean;

  /**
   * Service name for resource identification (required).
   */
  serviceName: string;

  /**
   * List of headers to include (case-insensitive).
   */
  headersAllowList?: string[];

  /**
   * List of headers to exclude (case-insensitive, takes precedence over allow list).
   */
  headersDenyList?: string[];

  /**
   * Capture request body.
   */
  captureRequestBody?: boolean;

  /**
   * Capture response body.
   */
  captureResponseBody?: boolean;

  /**
   * Domain allow list rules.
   */
  domainAllowList?: DomainRule[];

  /**
   * Domain deny list rules.
   */
  domainDenyList?: DomainRule[];

  /**
   * Number of spans to batch before flushing (only used in batched mode).
   * @defaultValue 50
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds (only used in batched mode).
   * @defaultValue 5000
   */
  batchTimeout?: number;

  /**
   * Span export mode to use.
   *
   * - **batched**: Recommended for production environments with long-running processes.
   *   Spans are batched and exported in groups for optimal performance.
   * - **immediate**: Recommended for short-lived environments such as serverless functions.
   *   Spans are exported immediately to prevent data loss when the process terminates / is frozen.
   *
   * @defaultValue "batched"
   */
  exportMode?: PingopsExportMode;
}
