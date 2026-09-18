import type { EditRequestState, JevDecision } from "../jev/decisions.js";

export interface BIMReasoningRequest {
  state: EditRequestState;
  jevDecision: JevDecision;
}

export interface BIMReasoningPlan {
  operation: "inspect" | "propose_geometry" | "propose_attribute" | "propose_delete" | "clarify";
  affectedStepIds: number[];
  requiredChecks: string[];
  proposedEditManifest?: string;
  requiresHumanApproval: true;
}

export interface BIMReasoningClient {
  plan(request: BIMReasoningRequest): Promise<BIMReasoningPlan>;
}
