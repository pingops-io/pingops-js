# @pingops/otel

OpenTelemetry `SpanProcessor` implementation for PingOps. This package provides the `PingopsSpanProcessor` that observes finished spans and sends eligible ones to the PingOps backend.

## Installation

```bash
pnpm add @pingops/otel
```

## Usage

### Basic Usage (Batched Mode)

```typescript
import { PingopsSpanProcessor } from "@pingops/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const processor = new PingopsSpanProcessor({
  apiKey: "your-api-key", // or set PINGOPS_API_KEY env var
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
  exportMode: "batched", // default
  batchSize: 50,
  batchTimeout: 5000,
});

const tracerProvider = new NodeTracerProvider();
tracerProvider.addSpanProcessor(processor);
tracerProvider.register();
```

### Immediate Mode (for Serverless)

```typescript
const processor = new PingopsSpanProcessor({
  apiKey: "your-api-key",
  baseUrl: "https://api.pingops.com",
  serviceName: "my-service",
  exportMode: "immediate", // Spans are sent immediately
});
```

## Configuration

### PingopsProcessorConfig

- `apiKey?: string` - API key for authentication (defaults to `PINGOPS_API_KEY` env var)
- `baseUrl: string` - PingOps backend URL (required)
- `debug?: boolean` - Enable debug logging (default: `false`)
- `serviceName: string` - Service name for resource identification (required)
- `headersAllowList?: string[]` - List of headers to include (case-insensitive)
- `headersDenyList?: string[]` - List of headers to exclude (case-insensitive, takes precedence)
- `domainAllowList?: DomainRule[]` - Domain allow list rules
- `domainDenyList?: DomainRule[]` - Domain deny list rules
- `batchSize?: number` - Batch size for sending spans, only used in batched mode (default: `50`)
- `batchTimeout?: number` - Batch timeout in milliseconds, only used in batched mode (default: `5000`)
- `exportMode?: 'immediate' | 'batched'` - Span export mode:
  - **batched**: Recommended for production environments with long-running processes. Spans are batched and exported in groups for optimal performance (default)
  - **immediate**: Recommended for short-lived environments such as serverless functions. Spans are exported immediately to prevent data loss when the process terminates

### Domain Rules

```typescript
interface DomainRule {
  domain: string; // Exact or suffix match (e.g., '.github.com')
  paths?: string[]; // Path prefix matches
  headersAllowList?: string[];
  headersDenyList?: string[];
}
```

## Span Filtering

The processor only captures spans that meet these criteria:

1. `span.kind === SpanKind.CLIENT` (outgoing requests only)
2. Has HTTP attributes (`http.method`, `http.url`, or `server.address`)
   OR has GenAI attributes (`gen_ai.system`, `gen_ai.operation.name`)

## How It Works

1. **Observation Only**: The processor implements `SpanProcessor` and only observes finished spans
2. **Filtering**: Filters spans based on kind, attributes, and domain rules
3. **Extraction**: Extracts structured data from eligible spans
4. **Export Modes**:
   - **Batched** (default): Batches spans before sending to reduce network overhead. Ideal for long-running processes.
   - **Immediate**: Sends spans immediately. Ideal for serverless functions or short-lived processes.
5. **Fire-and-Forget**: Sends spans asynchronously without blocking the application

## Integration with Existing OpenTelemetry

This processor is designed to work alongside existing OpenTelemetry exporters. It does not interfere with your existing telemetry pipeline.
