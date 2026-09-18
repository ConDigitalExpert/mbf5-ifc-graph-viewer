import { JEV_THRESHOLDS, confidenceBand } from "./thresholds.js";
import type { JevMode, PolicyDecision, RawJudgment } from "./decisions.js";

export function applyJevPolicy(judgment: RawJudgment, mode: JevMode): PolicyDecision {
  const intentConfidence = judgment.intent.confidence;
  const evidenceProbability = judgment.evidenceSufficientProbability;
  const specificity = judgment.specificity.score;
  const band = confidenceBand(intentConfidence);

  if (mode === "shadow") {
    return {
      action: "observe_only",
      reason: "Shadow mode records the recommendation without controlling a workflow or side effect.",
      confidenceBand: band,
      requiresHumanApproval: false,
      fallback: "Preserve the existing application decision and compare outcomes offline.",
      thresholdApplied: "shadow_mode",
    };
  }

  if (intentConfidence < JEV_THRESHOLDS.lowConfidence || evidenceProbability < JEV_THRESHOLDS.evidenceRequired) {
    return {
      action: "request_clarification",
      reason: "The bounded judgment or its evidence is below the minimum confidence required to route the request.",
      confidenceBand: "low",
      requiresHumanApproval: true,
      fallback: "Ask for a stable IFC target, explicit parameters, and the missing evidence.",
      thresholdApplied: "low_confidence_or_insufficient_evidence",
    };
  }

  if (judgment.intent.choice === "ambiguous" || specificity < JEV_THRESHOLDS.actionableSpecificity) {
    return {
      action: "request_clarification",
      reason: "The request is not specific enough to choose a safe application route.",
      confidenceBand: band,
      requiresHumanApproval: true,
      fallback: "Keep the model unchanged and request clarification.",
      thresholdApplied: "actionable_specificity",
    };
  }

  if (judgment.intent.choice === "query_model" && intentConfidence >= JEV_THRESHOLDS.readOnlyAutonomy) {
    return {
      action: "route_deterministic_query",
      reason: "A high confidence read-only request can be handled by deterministic graph and viewer code.",
      confidenceBand: "high",
      requiresHumanApproval: false,
      fallback: "Route to the reasoning model or human review if the query handler cannot resolve the evidence.",
      thresholdApplied: "read_only_autonomy",
    };
  }

  if (judgment.intent.choice === "modify_geometry" || judgment.intent.choice === "modify_attribute") {
    return {
      action: "route_reasoning",
      reason: "The bounded intent is clear enough to send to the BIM reasoning and validation pipeline, but writeback remains gated.",
      confidenceBand: band,
      requiresHumanApproval: true,
      fallback: "Do not write IFC; produce a proposed edit manifest for review.",
      thresholdApplied: "consequential_writeback_requires_human",
    };
  }

  return {
    action: "human_review",
    reason: "Creating or deleting model content is consequential and requires explicit authority after deterministic validation.",
    confidenceBand: band,
    requiresHumanApproval: true,
    fallback: "Do not create or delete IFC content.",
    thresholdApplied: "consequential_model_change",
  };
}
