import { context, SpanKind, trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { isTracingSuppressed, suppressTracing } from "@opentelemetry/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setPingopsTracerProvider,
  shutdownTracerProvider,
} from "@pingops/otel";
import {
  clearGlobalConfig,
  setGlobalConfig,
} from "../../otel/src/config-store";
import { resolveOutboundSpanParentContext } from "../../otel/src/instrumentations/suppression-guard";
import { runUnsuppressed, startTrace } from "../src/pingops";

function isClientSpanRecording(
  spanParentContext: ReturnType<typeof context.active>
): boolean {
  const span = trace
    .getTracer("suppression-test")
    .startSpan(
      "outbound-http-client",
      { kind: SpanKind.CLIENT },
      spanParentContext
    );
  const recording = span.isRecording();
  span.end();
  return recording;
}

describe("suppression leak handling", () => {
  beforeAll(() => {
    const provider = new NodeTracerProvider();
    provider.register();
    setPingopsTracerProvider(provider);
    setGlobalConfig({
      exportTraceUrl: "https://pingops.test/v1/traces",
    });
  });

  afterAll(async () => {
    clearGlobalConfig();
    await shutdownTracerProvider();
    setPingopsTracerProvider(null);
  });

  it("startTrace under suppressed parent context still captures client spans", async () => {
    const suppressedContext = suppressTracing(context.active());

    await context.with(suppressedContext, () => {
      return startTrace({}, () => {
        expect(isTracingSuppressed(context.active())).toBe(false);
        expect(isClientSpanRecording(context.active())).toBe(true);
      });
    });
  });

  it("runUnsuppressed under suppressed parent context captures client spans", () => {
    const suppressedContext = suppressTracing(context.active());

    context.with(suppressedContext, () => {
      return runUnsuppressed(() => {
        expect(isTracingSuppressed(context.active())).toBe(false);
        expect(isClientSpanRecording(context.active())).toBe(true);
      });
    });
  });

  it("initializePingops flow captures client spans under leaked suppression without startTrace", () => {
    const suppressedContext = suppressTracing(context.active());

    context.with(suppressedContext, () => {
      const spanParentContext = resolveOutboundSpanParentContext(
        context.active(),
        "https://api.example.com/v1/users"
      );
      expect(isTracingSuppressed(spanParentContext)).toBe(false);
      expect(isClientSpanRecording(spanParentContext)).toBe(true);
    });
  });

  it("exporter requests remain suppressed (no recursive self-instrumentation)", () => {
    const suppressedContext = suppressTracing(context.active());

    context.with(suppressedContext, () => {
      const spanParentContext = resolveOutboundSpanParentContext(
        context.active(),
        "https://pingops.test/v1/traces"
      );
      expect(isTracingSuppressed(spanParentContext)).toBe(true);
      expect(isClientSpanRecording(spanParentContext)).toBe(false);
    });
  });

  it("undici-style exporter URLs (absolute with query) remain suppressed", () => {
    const suppressedContext = suppressTracing(context.active());

    context.with(suppressedContext, () => {
      const spanParentContext = resolveOutboundSpanParentContext(
        context.active(),
        "https://pingops.test/v1/traces?format=proto&compression=gzip"
      );
      expect(isTracingSuppressed(spanParentContext)).toBe(true);
      expect(isClientSpanRecording(spanParentContext)).toBe(false);
    });
  });

  it("normal unsuppressed context behavior remains unchanged", () => {
    expect(isTracingSuppressed(context.active())).toBe(false);
    const spanParentContext = resolveOutboundSpanParentContext(
      context.active(),
      "https://api.example.com/v1/health"
    );
    expect(isTracingSuppressed(spanParentContext)).toBe(false);
    expect(isClientSpanRecording(spanParentContext)).toBe(true);
  });
});
