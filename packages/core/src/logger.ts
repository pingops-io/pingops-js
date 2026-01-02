/**
 * Global logger utility for PingOps Core
 *
 * Provides consistent logging across all core components with support for
 * different log levels and debug mode control via PINGOPS_DEBUG environment variable.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Creates a logger instance with a specific prefix
 *
 * @param prefix - Prefix to add to all log messages (e.g., '[PingOps Filter]')
 * @returns Logger instance
 */
export function createLogger(prefix: string): Logger {
  const isDebugEnabled = process.env.PINGOPS_DEBUG === "true";

  const formatMessage = (level: LogLevel, message: string): string => {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${prefix} [${level.toUpperCase()}] ${message}`;
  };

  return {
    debug(message: string, ...args: unknown[]): void {
      if (isDebugEnabled) {
        console.debug(formatMessage("debug", message), ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      console.log(formatMessage("info", message), ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(formatMessage("warn", message), ...args);
    },
    error(message: string, ...args: unknown[]): void {
      console.error(formatMessage("error", message), ...args);
    },
  };
}
