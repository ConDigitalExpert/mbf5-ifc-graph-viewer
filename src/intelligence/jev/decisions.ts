export const EDIT_INTENTS = [
  "modify_geometry",
  "modify_attribute",
  "query_model",
  "create_element",
  "delete_element",
  "ambiguous",
] as const;

export type EditIntent = (typeof EDIT_INTENTS)[number];
export type JevMode = "shadow" | "assisted" | "selective-autonomy";
export type Provider = "typesafe-jev" | "fallback";

export interface ModelEvidence {
  source: string;
  reference: string;
  excerpt?: string;
  provenance?: string;
}

export interface EditRequestState {
  request: string;
  stage: "phase1" | "stage2";
  selectedStepIds?: number[];
  selectedGlobalIds?: string[];
  modelSnapshot?: {
    sourceSha256?: string;
    elementCount?: number;
    relationshipCount?: number;
    graphRevision?: string;
  };
  parsedParameters?: Record<string, string | number | boolean>;
  evidence?: ModelEvidence[];
  consequential?: boolean;
}

export interface ChoiceJudgment {
  choice: EditIntent;
  confidence: number;
  probabilities: Record<EditIntent, number>;
}

export interface ScoreJudgment {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface RawJudgment {
  intent: ChoiceJudgment;
  evidenceSufficientProbability: number;
  specificity: ScoreJudgment;
}

export type PolicyAction =
  | "observe_only"
  | "route_deterministic_query"
  | "route_reasoning"
  | "request_clarification"
  | "human_review";

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  confidenceBand: "low" | "medium" | "high";
  requiresHumanApproval: boolean;
  fallback: string;
  thresholdApplied: string;
}

export interface JevDecision {
  decisionId: string;
  createdAt: string;
  mode: JevMode;
  provider: Provider;
  model: string | null;
  stateReference: string;
  state: EditRequestState;
  judgment: RawJudgment | null;
  policy: PolicyDecision;
  fallbackReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}
