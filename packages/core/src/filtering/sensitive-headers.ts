/**
 * Sensitive header patterns and redaction configuration
 */

/**
 * Default patterns for sensitive headers that should be redacted
 * These are matched case-insensitively
 */
export const DEFAULT_SENSITIVE_HEADER_PATTERNS = [
  // Authentication & Authorization
  "authorization",
  "www-authenticate",
  "proxy-authenticate",
  "proxy-authorization",
  "x-auth-token",
  "x-api-key",
  "x-api-token",
  "x-access-token",
  "x-auth-user",
  "x-auth-password",
  "x-csrf-token",
  "x-xsrf-token",

  // API Keys & Access Tokens
  "api-key",
  "apikey",
  "api_key",
  "access-key",
  "accesskey",
  "access_key",
  "secret-key",
  "secretkey",
  "secret_key",
  "private-key",
  "privatekey",
  "private_key",

  // Session & Cookie tokens
  "cookie",
  "set-cookie",
  "session-id",
  "sessionid",
  "session_id",
  "session-token",
  "sessiontoken",
  "session_token",

  // OAuth & OAuth2
  "oauth-token",
  "oauth_token",
  "oauth2-token",
  "oauth2_token",
  "bearer",

  // AWS & Cloud credentials
  "x-amz-security-token",
  "x-amz-signature",
  "x-aws-access-key",
  "x-aws-secret-key",
  "x-aws-session-token",

  // Other common sensitive headers
  "x-password",
  "x-secret",
  "x-token",
  "x-jwt",
  "x-jwt-token",
  "x-refresh-token",
  "x-client-secret",
  "x-client-id",
  "x-user-token",
  "x-service-key",
] as const;

/**
 * Redaction strategies for sensitive header values
 */
export enum HeaderRedactionStrategy {
  /**
   * Replace the entire value with a fixed redaction string
   */
  REPLACE = "replace",
  /**
   * Show only the first N characters, redact the rest
   */
  PARTIAL = "partial",
  /**
   * Show only the last N characters, redact the rest
   */
  PARTIAL_END = "partial_end",
  /**
   * Remove the header entirely (same as deny list)
   */
  REMOVE = "remove",
}

/**
 * Configuration for header redaction
 */
export interface HeaderRedactionConfig {
  /**
   * Patterns to match sensitive headers (case-insensitive)
   * Defaults to DEFAULT_SENSITIVE_HEADER_PATTERNS if not provided
   */
  sensitivePatterns?: readonly string[];

  /**
   * Redaction strategy to use
   * @default HeaderRedactionStrategy.REPLACE
   */
  strategy?: HeaderRedactionStrategy;

  /**
   * Redaction string used when strategy is REPLACE
   * @default "[REDACTED]"
   */
  redactionString?: string;

  /**
   * Number of characters to show when strategy is PARTIAL or PARTIAL_END
   * @default 4
   */
  visibleChars?: number;

  /**
   * Whether to enable redaction
   * @default true
   */
  enabled?: boolean;
}

/**
 * Default redaction configuration
 */
export const DEFAULT_REDACTION_CONFIG: Required<HeaderRedactionConfig> = {
  sensitivePatterns: DEFAULT_SENSITIVE_HEADER_PATTERNS,
  strategy: HeaderRedactionStrategy.REPLACE,
  redactionString: "[REDACTED]",
  visibleChars: 4,
  enabled: true,
};

/**
 * Checks if a header name matches any sensitive pattern
 * Uses case-insensitive matching with exact match, prefix/suffix, and substring matching
 *
 * @param headerName - The header name to check
 * @param patterns - Array of patterns to match against (defaults to DEFAULT_SENSITIVE_HEADER_PATTERNS)
 * @returns true if the header matches any sensitive pattern
 */
export function isSensitiveHeader(
  headerName: string,
  patterns: readonly string[] = DEFAULT_SENSITIVE_HEADER_PATTERNS
): boolean {
  if (!headerName || typeof headerName !== "string") {
    return false;
  }

  if (!patterns || patterns.length === 0) {
    return false;
  }

  const normalizedName = headerName.toLowerCase().trim();

  // Early return for empty string
  if (normalizedName.length === 0) {
    return false;
  }

  return patterns.some((pattern) => {
    if (!pattern || typeof pattern !== "string") {
      return false;
    }

    const normalizedPattern = pattern.toLowerCase().trim();

    // Empty pattern doesn't match
    if (normalizedPattern.length === 0) {
      return false;
    }

    // Exact match (most common case, check first)
    if (normalizedName === normalizedPattern) {
      return true;
    }

    // Check if header name contains the pattern (e.g., "x-api-key" contains "api-key")
    // This handles cases where patterns are embedded in header names
    if (normalizedName.includes(normalizedPattern)) {
      return true;
    }

    // Check if pattern contains the header name (for shorter patterns matching longer headers)
    // This is less common but handles edge cases
    if (normalizedPattern.includes(normalizedName)) {
      return true;
    }

    return false;
  });
}

/**
 * Redacts a header value based on the configuration
 */
export function redactHeaderValue(
  value: string | string[] | undefined,
  config: Required<HeaderRedactionConfig>
): string | string[] | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  // Handle array of values
  if (Array.isArray(value)) {
    return value.map((v) => redactSingleValue(v, config));
  }

  return redactSingleValue(value, config);
}

/**
 * Redacts a single string value based on the configured strategy
 *
 * @param value - The value to redact
 * @param config - Redaction configuration
 * @returns Redacted value
 */
function redactSingleValue(
  value: string,
  config: Required<HeaderRedactionConfig>
): string {
  // Validate input
  if (!value || typeof value !== "string") {
    return value;
  }

  // Ensure visibleChars is a positive integer
  const visibleChars = Math.max(0, Math.floor(config.visibleChars || 0));
  const trimmedValue = value.trim();

  // Handle empty or very short values
  if (trimmedValue.length === 0) {
    return config.redactionString;
  }

  switch (config.strategy) {
    case HeaderRedactionStrategy.REPLACE:
      return config.redactionString;

    case HeaderRedactionStrategy.PARTIAL:
      // Show first N characters, then redaction string
      if (trimmedValue.length <= visibleChars) {
        // If value is shorter than visible chars, just redact it all
        return config.redactionString;
      }
      return trimmedValue.substring(0, visibleChars) + config.redactionString;

    case HeaderRedactionStrategy.PARTIAL_END:
      // Show last N characters, with redaction string prefix
      if (trimmedValue.length <= visibleChars) {
        // If value is shorter than visible chars, just redact it all
        return config.redactionString;
      }
      return (
        config.redactionString +
        trimmedValue.substring(trimmedValue.length - visibleChars)
      );

    case HeaderRedactionStrategy.REMOVE:
      // This should be handled at the filter level, not here
      // But if we reach here, return redaction string as fallback
      return config.redactionString;

    default:
      // Unknown strategy - default to full redaction for safety
      return config.redactionString;
  }
}
