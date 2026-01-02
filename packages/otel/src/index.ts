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
export { createHttpInstrumentation } from "./instrumentations/http";
export { createUndiciInstrumentation } from "./instrumentations/undici";
