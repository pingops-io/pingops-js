/**
 * @pingops/otel - OpenTelemetry SpanProcessor for PingOps
 */

export { PingopsSpanProcessor } from "./span-processor";
export type { PingopsProcessorConfig } from "./config";
export {
  setPingopsTracerProvider,
  getPingopsTracerProvider,
  shutdownTracerProvider,
} from "./tracer-provider";
export { getInstrumentations } from "./instrumentations";
export { createHttpInstrumentation } from "./instrumentations/http/http";
export { createUndiciInstrumentation } from "./instrumentations/undici/undici";
export {
  PingopsHttpInstrumentation,
  PingopsHttpSemanticAttributes,
  type PingopsHttpInstrumentationConfig,
  PingopsSemanticAttributes,
  type PingopsInstrumentationConfig,
} from "./instrumentations/http/pingops-http";
