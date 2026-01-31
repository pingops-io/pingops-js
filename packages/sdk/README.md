# @pingops/sdk

**PingOps SDK for Node.js** — Bootstrap OpenTelemetry and capture outgoing HTTP and fetch API calls with minimal code. Built for observability of external API usage, AI/LLM calls, and third-party integrations.

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Tracing](#tracing)
- [Filtering & Privacy](#filtering--privacy)
- [Integration with Existing OpenTelemetry](#integration-with-existing-opentelemetry)
- [What Gets Captured](#what-gets-captured)
- [Requirements](#requirements)

---

## Overview

The PingOps SDK gives you:

- **Automatic instrumentation** — Outgoing HTTP (Node.js `http` module) and `fetch` (via Undici) are instrumented without wrapping your code.
- **Structured traces** — Start traces with `userId`, `sessionId`, tags, and metadata so every span is tied to your business context.
- **Control over what is captured** — Domain allow/deny lists, header filtering, and optional request/response body capture with size limits.
- **Flexible setup** — Use environment variables, a config file (JSON or YAML), or pass config programmatically. Auto-initialize via `--require` or import `@pingops/sdk/register` first.

You initialize once (at process startup or before any HTTP clients load); after that, outgoing requests are captured and sent to your PingOps backend in batches or immediately.

---

## Installation

```bash
pnpm add @pingops/sdk
```

Or with npm:

```bash
npm install @pingops/sdk
```

**Requirement:** Node.js **20 or later** (for native `fetch` and modern APIs).

---

## Quick Start

### Option 1: Auto-initialization (recommended)

**Best for:** Getting started quickly and for production when config comes from environment or a config file.

**A. Using Node.js `--require`** (runs before any application code):

```bash
node --require @pingops/sdk/register your-app.js
```

Set required environment variables:

```bash
export PINGOPS_API_KEY="your-api-key"
export PINGOPS_BASE_URL="https://api.pingops.com"
export PINGOPS_SERVICE_NAME="my-service"
```

**B. Importing the register entry first** (must be before any HTTP client imports):

```typescript
// Must be first — before axios, node-fetch, or any code that makes HTTP requests
import "@pingops/sdk/register";

import axios from "axios";
// ... rest of your application
```

With a config file, set `PINGOPS_CONFIG_FILE` to the path to your JSON or YAML file; environment variables override values from the file.

### Option 2: Manual initialization

**Best for:** Config from code, feature flags, or when you need to ensure initialization order explicitly.

```typescript
import { initializePingops } from "@pingops/sdk";

// Before importing or using any HTTP clients
initializePingops({
  apiKey: process.env.PINGOPS_API_KEY,
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
});

import axios from "axios";
// ... rest of your application
```

You can also initialize from a config file path (environment variables still override file values):

```typescript
initializePingops("./pingops.config.yaml");
// or
initializePingops({ configFile: "./pingops.config.json" });
```

**Important:** Call `initializePingops` before any HTTP client is loaded or used so instrumentation is applied correctly.

---

## Configuration

Configuration can be provided via:

1. **Programmatic config** — Object passed to `initializePingops(...)`
2. **Config file** — Path as first argument or `{ configFile: "path" }`; supports JSON and YAML
3. **Environment variables** — Always override file and can supply all required fields for auto-init

### Required fields

| Field          | Env var               | Description                    |
|----------------|-----------------------|--------------------------------|
| `baseUrl`      | `PINGOPS_BASE_URL`    | PingOps backend base URL       |
| `serviceName`  | `PINGOPS_SERVICE_NAME`| Service name for resource      |

`apiKey` is optional at config level; if your backend requires it, set `apiKey` or `PINGOPS_API_KEY`.

### Full configuration reference

| Option                  | Type                    | Default    | Description |
|-------------------------|-------------------------|------------|-------------|
| `apiKey`                | `string`                | —          | API key (or `PINGOPS_API_KEY`) |
| `baseUrl`               | `string`                | **required** | Backend base URL |
| `serviceName`           | `string`                | **required** | Service name |
| `debug`                 | `boolean`               | `false`    | Enable debug logs (`PINGOPS_DEBUG=true`) |
| `headersAllowList`      | `string[]`              | —          | Headers to include (case-insensitive) |
| `headersDenyList`       | `string[]`              | —          | Headers to exclude (overrides allow) |
| `captureRequestBody`    | `boolean`               | `false`    | Capture request bodies (global) |
| `captureResponseBody`   | `boolean`               | `false`    | Capture response bodies (global) |
| `maxRequestBodySize`    | `number`                | `4096`     | Max request body size in bytes |
| `maxResponseBodySize`   | `number`                | `4096`     | Max response body size in bytes |
| `domainAllowList`       | `DomainRule[]`          | —          | Domains (and optional rules) to allow |
| `domainDenyList`       | `DomainRule[]`          | —          | Domains to exclude |
| `headerRedaction`       | `HeaderRedactionConfig` | —          | Custom header redaction |
| `batchSize`             | `number`                | `50`       | Spans per batch (`PINGOPS_BATCH_SIZE`) |
| `batchTimeout`          | `number`                | `5000`     | Flush interval in ms (`PINGOPS_BATCH_TIMEOUT`) |
| `exportMode`            | `"batched"` \| `"immediate"` | `"batched"` | `PINGOPS_EXPORT_MODE` |

**Config file path:** Set `PINGOPS_CONFIG_FILE` to the path of your JSON or YAML file when using the register entry.

**Export mode:**

- **`batched`** — Best for long-running processes; spans are sent in batches (default).
- **`immediate`** — Best for serverless/short-lived processes; each span is sent as it finishes to reduce loss on freeze/exit.

### Config file examples

**JSON (`pingops.config.json`):**

```json
{
  "apiKey": "your-api-key",
  "baseUrl": "https://api.pingops.com",
  "serviceName": "my-service",
  "debug": false,
  "exportMode": "batched",
  "batchSize": 50,
  "batchTimeout": 5000,
  "captureRequestBody": false,
  "captureResponseBody": false
}
```

**YAML (`pingops.config.yaml`):**

```yaml
apiKey: your-api-key
baseUrl: https://api.pingops.com
serviceName: my-service
debug: false
exportMode: batched
batchSize: 50
batchTimeout: 5000
```

---

## API Reference

### `initializePingops(config)`

Initializes the PingOps SDK: sets up OpenTelemetry `NodeSDK`, registers the PingOps span processor, and enables HTTP and Undici (fetch) instrumentation.

**Overloads:**

- `initializePingops(config: PingopsProcessorConfig): void`
- `initializePingops(configFilePath: string): void`
- `initializePingops({ configFile: string }): void`

**Example:**

```typescript
import { initializePingops } from "@pingops/sdk";

initializePingops({
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
  apiKey: process.env.PINGOPS_API_KEY,
  exportMode: "immediate", // e.g. for serverless
});
```

Calling `initializePingops` again after the first successful call is a no-op (idempotent).

---

### `shutdownPingops()`

Gracefully shuts down the SDK and flushes remaining spans. Returns a `Promise<void>`.

**Example:**

```typescript
import { shutdownPingops } from "@pingops/sdk";

process.on("SIGTERM", async () => {
  await shutdownPingops();
  process.exit(0);
});
```

---

### `startTrace(options, fn)`

Starts a new trace, sets PingOps attributes (e.g. `userId`, `sessionId`, tags, metadata) in context, runs the given function inside that context, and returns the function’s result. Any spans created inside the function (including automatic HTTP/fetch spans) are part of this trace and carry the same context.

**Parameters:**

- `options.attributes` — Optional [PingopsTraceAttributes](#pingopstraceattributes) to attach to the trace and propagate to spans.
- `options.seed` — Optional string; when provided, a deterministic trace ID is derived from it (useful for idempotency or correlation with external systems).
- `fn` — `() => T | Promise<T>`. Your code; runs inside the new trace and attribute context.

**Returns:** `Promise<T>` — The result of `fn`.

**Example:**

```typescript
import { startTrace, initializePingops } from "@pingops/sdk";

initializePingops({ baseUrl: "...", serviceName: "my-api" });

const data = await startTrace(
  {
    attributes: {
      userId: "user-123",
      sessionId: "sess-456",
      tags: ["checkout", "v2"],
      metadata: { plan: "pro", region: "us" },
      captureRequestBody: true,
      captureResponseBody: true,
    },
    seed: "order-789", // optional: stable trace ID for this order
  },
  async () => {
    const res = await fetch("https://api.stripe.com/v1/charges", { ... });
    return res.json();
  }
);
```

---

### `getActiveTraceId()`

Returns the trace ID of the currently active span, or `undefined` if there is none.

**Example:**

```typescript
import { getActiveTraceId } from "@pingops/sdk";

const traceId = getActiveTraceId();
console.log("Current trace:", traceId);
```

---

### `getActiveSpanId()`

Returns the span ID of the currently active span, or `undefined` if there is none.

**Example:**

```typescript
import { getActiveSpanId } from "@pingops/sdk";

const spanId = getActiveSpanId();
```

---

### `PingopsTraceAttributes`

Type for attributes you can pass into `startTrace({ attributes })`:

| Field                   | Type                     | Description |
|-------------------------|--------------------------|-------------|
| `traceId`               | `string`                 | Override trace ID (otherwise one is generated or derived from `seed`) |
| `userId`                | `string`                 | User identifier |
| `sessionId`             | `string`                 | Session identifier |
| `tags`                  | `string[]`               | Tags for the trace |
| `metadata`              | `Record<string, string>` | Key-value metadata |
| `captureRequestBody`    | `boolean`                | Override request body capture for spans in this trace |
| `captureResponseBody`   | `boolean`                | Override response body capture for spans in this trace |

---

## Tracing

### Why use `startTrace`?

- **Correlation** — Tie all outgoing calls in a request (or job) to one trace and to a user/session.
- **Stable IDs** — Use `seed` (e.g. request ID or order ID) to get a deterministic trace ID for logging or external systems.
- **Scoped body capture** — Enable `captureRequestBody` / `captureResponseBody` only for specific traces (e.g. a single webhook or LLM call) instead of globally.

### Auto-initialization when using `startTrace`

If you call `startTrace` before calling `initializePingops`, the SDK will try to auto-initialize from environment variables (`PINGOPS_API_KEY`, `PINGOPS_BASE_URL`, `PINGOPS_SERVICE_NAME`). If any of these are missing, `startTrace` throws. For predictable behavior, prefer initializing explicitly at startup.

### Example: request-scoped trace

```typescript
import { startTrace, getActiveTraceId, initializePingops } from "@pingops/sdk";

initializePingops({ baseUrl: "...", serviceName: "my-api" });

app.post("/webhook", async (req, res) => {
  const result = await startTrace(
    {
      attributes: {
        userId: req.user?.id,
        sessionId: req.sessionId,
        tags: ["webhook"],
        metadata: { provider: req.body.provider },
      },
      seed: req.headers["x-request-id"] ?? undefined,
    },
    async () => {
      await callExternalApi(req.body);
      return { ok: true };
    }
  );

  const traceId = getActiveTraceId();
  res.setHeader("X-Trace-Id", traceId ?? "");
  res.json(result);
});
```

---

## Filtering & Privacy

### Domain allow/deny lists

Restrict which domains (and optionally paths) are captured:

```typescript
initializePingops({
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
  domainAllowList: [
    { domain: "api.github.com", paths: ["/repos"] },
    { domain: ".openai.com" }, // suffix match
    {
      domain: "generativelanguage.googleapis.com",
      captureRequestBody: true,
      captureResponseBody: true,
    },
  ],
  domainDenyList: [
    { domain: "internal.corp.local" },
  ],
});
```

Each rule in `domainAllowList` / `domainDenyList` can include:

- `domain` — Exact or suffix (e.g. `.openai.com`) match.
- `paths` — Optional path prefixes to allow/deny.
- `headersAllowList` / `headersDenyList` — Header rules for that domain.
- `captureRequestBody` / `captureResponseBody` — Override body capture for that domain.

### Header allow/deny lists

Control which headers are included on captured spans (global default; domain rules can refine):

```typescript
initializePingops({
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
  headersAllowList: ["user-agent", "x-request-id", "content-type"],
  headersDenyList: ["authorization", "cookie", "x-api-key"],
});
```

Deny list takes precedence over allow list. Sensitive headers are redacted by default; use `headerRedaction` in config for custom behavior.

### Request/response body capture

- **Global:** `captureRequestBody` and `captureResponseBody` in config.
- **Per-domain:** Same flags on a [DomainRule](#domain-allowdeny-lists).
- **Per-trace:** `captureRequestBody` / `captureResponseBody` in [PingopsTraceAttributes](#pingopstraceattributes) in `startTrace`.

Body size is capped by `maxRequestBodySize` and `maxResponseBodySize` (default 4096 bytes each). Larger bodies are truncated.

---

## Integration with Existing OpenTelemetry

If you already use OpenTelemetry and only want the PingOps exporter and filtering, use `PingopsSpanProcessor` from `@pingops/otel` and add it to your existing `TracerProvider`:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PingopsSpanProcessor } from "@pingops/otel";

const sdk = new NodeSDK({
  spanProcessors: [
    new PingopsSpanProcessor({
      apiKey: "your-api-key",
      baseUrl: "https://api.pingops.com",
      serviceName: "my-service",
      exportMode: "batched",
      domainAllowList: [{ domain: "api.example.com" }],
    }),
  ],
  // your existing instrumentations, resource, etc.
});

sdk.start();
```

You can still use `@pingops/sdk` for `startTrace`, `getActiveTraceId`, and `getActiveSpanId`; ensure your tracer provider is the one that uses `PingopsSpanProcessor` (or is bridged to it) so those spans are exported to PingOps.

---

## What Gets Captured

- **Outgoing HTTP** — Requests made with Node’s `http` / `https` (e.g. many HTTP clients under the hood).
- **Outgoing fetch** — Requests made with the global `fetch` (in Node.js 18+ this is implemented by Undici; both are instrumented).

Only **CLIENT** spans with HTTP (or supported semantic) attributes are exported to PingOps; server-side and internal spans are filtered out.

---

## Requirements

- **Node.js** ≥ **20**
- **ESM** — The package is published as ES modules; use `import` and, if needed, `"type": "module"` or `.mjs`.

---

## Summary

| Goal | What to do |
|------|------------|
| Install | `pnpm add @pingops/sdk` |
| Auto-init from env | `node --require @pingops/sdk/register your-app.js` or `import "@pingops/sdk/register"` first |
| Manual init | `initializePingops({ baseUrl, serviceName, ... })` before any HTTP usage |
| Config from file | `PINGOPS_CONFIG_FILE=./pingops.config.yaml` or `initializePingops("./pingops.config.json")` |
| Trace with context | `startTrace({ attributes: { userId, sessionId, tags, metadata }, seed? }, async () => { ... })` |
| Get current IDs | `getActiveTraceId()`, `getActiveSpanId()` |
| Graceful shutdown | `await shutdownPingops()` |

For more detail on types and options, see the [Configuration](#configuration) and [API Reference](#api-reference) sections above.
