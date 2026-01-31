/**
 * @pingops/sdk - Public API
 */

export {
  initializePingops,
  shutdownPingops,
  startTrace,
  getActiveTraceId,
  getActiveSpanId,
} from "./pingops";
export type { PingopsTraceAttributes } from "@pingops/core";
