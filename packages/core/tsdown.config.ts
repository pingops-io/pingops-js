import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  treeshake: true,
  target: "es2022",
  external: ["@opentelemetry/api", "@opentelemetry/sdk-trace-base"],
});
