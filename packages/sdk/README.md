# @pingops/sdk

PingOps SDK for Node.js. Provides a simple API for bootstrapping OpenTelemetry and capturing outgoing API and LLM calls.

## Installation

```bash
pnpm add @pingops/sdk
```

## Quick Start

### Option 1: Auto-initialization (Recommended)

**Most automatic approach** - Use Node.js `--require` flag (runs before any imports):

```bash
node --require @pingops/sdk/register your-app.js
```

Set environment variables:

```bash
export PINGOPS_API_KEY="your-api-key"
export PINGOPS_BASE_URL="https://api.pingops.com"
export PINGOPS_SERVICE_NAME="my-service"
```

**Or** import the register file FIRST in your code:

```typescript
// Import this FIRST, before any HTTP clients
import "@pingops/sdk/register";

import axios from "axios";
// ... rest of your code
```

### Option 2: Manual initialization

```typescript
import { initializePingops } from "@pingops/sdk";

initializePingops({
  apiKey: "your-api-key", // or set PINGOPS_API_KEY env var
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
});
```

**Important**: If using manual initialization, call `initializePingops()` before importing any HTTP clients (axios, fetch, etc.) to ensure proper instrumentation.

## Features

- **Automatic Instrumentation**: Captures HTTP and fetch API calls automatically
- **Node.js Support**: Works in Node.js environments (including Node.js 20+ with native fetch)
- **GenAI Support**: Captures LLM calls using OpenTelemetry GenAI semantic conventions
- **Manual Instrumentation**: Create custom spans for specific operations
- **Zero Configuration**: Works out of the box with sensible defaults

## API

### `initializePingops(config)`

Initializes the PingOps SDK with OpenTelemetry.

**Configuration:**

```typescript
interface PingopsInitConfig {
  apiKey?: string; // Defaults to PINGOPS_API_KEY env var
  baseUrl: string; // Required
  serviceName: string; // Required
  debug?: boolean;
  headersAllowList?: string[];
  headersDenyList?: string[];
  domainAllowList?: DomainRule[];
  domainDenyList?: DomainRule[];
  batchSize?: number; // Default: 50
  batchTimeout?: number; // Default: 5000ms
}
```

### `pingops.startSpan(name, attributes, fn)`

Creates a manual span for custom instrumentation.

```typescript
import { pingops } from "@pingops/sdk";

await pingops.startSpan(
  "external.api.call",
  {
    customer_id: "cust_123",
    correlation_id: "req_456",
    "custom_attributes.request_type": "webhook",
  },
  async (span) => {
    // Your code here
    const result = await fetch("https://api.example.com/data");
    return result.json();
  }
);
```

The span is automatically ended when the function completes or throws an error.

### `shutdownPingops()`

Gracefully shuts down the SDK and flushes remaining spans.

```typescript
import { shutdownPingops } from "@pingops/sdk";

await shutdownPingops();
```

## Domain Filtering

Control which domains and paths are captured:

```typescript
initializePingops({
  // ... other config
  domainAllowList: [
    {
      domain: "api.github.com",
      paths: ["/repos"],
      headersAllowList: ["authorization", "user-agent"],
    },
    {
      domain: ".openai.com", // Suffix match
    },
  ],
  domainDenyList: [
    {
      domain: "internal.service.local",
    },
  ],
});
```

## Header Filtering

Control which headers are captured:

```typescript
initializePingops({
  // ... other config
  headersAllowList: ["user-agent", "x-request-id"],
  headersDenyList: ["authorization", "cookie"],
});
```

## Integration with Existing OpenTelemetry

If you already have OpenTelemetry set up, you can use just the `PingopsSpanProcessor`:

```typescript
import { PingopsSpanProcessor } from "@pingops/otel";
import { getTracerProvider } from "@opentelemetry/api";

const processor = new PingopsSpanProcessor({
  apiKey: "your-api-key",
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
});

const tracerProvider = getTracerProvider();
// Add processor to your existing tracer provider
```

## What Gets Captured

- **HTTP Requests**: All outgoing HTTP requests (via `http` module in Node.js)
- **Fetch API**: All `fetch()` calls (universal JS)
- **GenAI Calls**: LLM API calls that follow OpenTelemetry GenAI semantic conventions

## What Doesn't Get Captured

- Incoming requests (server-side)
- Internal spans (non-CLIENT spans)
- Spans without HTTP or GenAI attributes

## Requirements

- **Node.js**: Requires Node.js 20+ (for native fetch support) or Node.js 18+ with fetch polyfill
