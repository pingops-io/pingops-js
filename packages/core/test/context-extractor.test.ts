import { context } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import {
  PINGOPS_METADATA,
  PINGOPS_SESSION_ID,
  PINGOPS_TAGS,
  PINGOPS_TRACE_ID,
  PINGOPS_USER_ID,
} from "../src/context-keys";
import { getPropagatedAttributesFromContext } from "../src/utils/context-extractor";

describe("getPropagatedAttributesFromContext", () => {
  it("extracts all supported propagated attributes", () => {
    const ctx = context
      .active()
      .setValue(PINGOPS_TRACE_ID, "trace-1")
      .setValue(PINGOPS_USER_ID, "user-1")
      .setValue(PINGOPS_SESSION_ID, "session-1")
      .setValue(PINGOPS_TAGS, ["tag-a", "tag-b"])
      .setValue(PINGOPS_METADATA, {
        env: "prod",
        region: "us-east-1",
      });

    expect(getPropagatedAttributesFromContext(ctx)).toEqual({
      "pingops.trace_id": "trace-1",
      "pingops.user_id": "user-1",
      "pingops.session_id": "session-1",
      "pingops.tags": ["tag-a", "tag-b"],
      "pingops.metadata.env": "prod",
      "pingops.metadata.region": "us-east-1",
    });
  });

  it("ignores invalid value types", () => {
    const ctx = context
      .active()
      .setValue(PINGOPS_TRACE_ID, 123 as never)
      .setValue(PINGOPS_TAGS, "not-array" as never)
      .setValue(PINGOPS_METADATA, {
        valid: "ok",
        invalid: 123,
      } as never);

    expect(getPropagatedAttributesFromContext(ctx)).toEqual({
      "pingops.metadata.valid": "ok",
    });
  });
});
