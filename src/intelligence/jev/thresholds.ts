export const JEV_THRESHOLDS = {
  lowConfidence: 0.5,
  assistedReview: 0.7,
  readOnlyAutonomy: 0.9,
  evidenceRequired: 0.9,
  actionableSpecificity: 2,
  fullySpecifiedSpecificity: 2.75,
} as const;

export function confidenceBand(confidence: number): "low" | "medium" | "high" {
  if (confidence < JEV_THRESHOLDS.lowConfidence) return "low";
  if (confidence < JEV_THRESHOLDS.readOnlyAutonomy) return "medium";
  return "high";
}
