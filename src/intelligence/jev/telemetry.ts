import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { JevDecision } from "./decisions.js";

export interface JevTelemetryEvent {
  event: "jev_decision";
  decisionId: string;
  createdAt: string;
  provider: JevDecision["provider"];
  model: string | null;
  mode: JevDecision["mode"];
  stateReference: string;
  intent: string | null;
  intentConfidence: number | null;
  probabilities: Record<string, number> | null;
  policyAction: JevDecision["policy"]["action"];
  fallbackReason?: string;
}

export function toTelemetryEvent(decision: JevDecision): JevTelemetryEvent {
  return {
    event: "jev_decision",
    decisionId: decision.decisionId,
    createdAt: decision.createdAt,
    provider: decision.provider,
    model: decision.model,
    mode: decision.mode,
    stateReference: decision.stateReference,
    intent: decision.judgment?.intent.choice ?? null,
    intentConfidence: decision.judgment?.intent.confidence ?? null,
    probabilities: decision.judgment?.intent.probabilities ?? null,
    policyAction: decision.policy.action,
    ...(decision.fallbackReason ? { fallbackReason: decision.fallbackReason } : {}),
  };
}

export function appendTelemetry(path: string, decision: JevDecision): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(toTelemetryEvent(decision))}\n`);
}
