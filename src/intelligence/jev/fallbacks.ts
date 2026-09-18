import { createHash } from "node:crypto";
import type { EditRequestState, JevDecision, JevMode } from "./decisions.js";

export function stableStateReference(state: EditRequestState): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, canonicalize(nested)]),
      );
    }
    return value;
  };
  const normalized = JSON.stringify(canonicalize(state));
  return createHash("sha256").update(normalized).digest("hex");
}

export function makeFailClosedDecision(
  state: EditRequestState,
  mode: JevMode,
  reason: string,
  now = new Date().toISOString(),
): JevDecision {
  return {
    decisionId: `jev-${stableStateReference(state).slice(0, 16)}`,
    createdAt: now,
    mode,
    provider: "fallback",
    model: null,
    stateReference: stableStateReference(state),
    state,
    judgment: null,
    policy: {
      action: mode === "shadow" ? "observe_only" : "request_clarification",
      reason: `Jev was unavailable: ${reason}`,
      confidenceBand: "low",
      requiresHumanApproval: true,
      fallback: "Fail closed. Do not allow a semantic fallback to mutate IFC or viewer state.",
      thresholdApplied: "provider_unavailable",
    },
    fallbackReason: reason,
  };
}
