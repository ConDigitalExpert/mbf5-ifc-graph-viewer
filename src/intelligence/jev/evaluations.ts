import type { EditRequestState, EditIntent } from "./decisions.js";

export interface JevEvaluationExample {
  id: string;
  state: EditRequestState;
  expectedIntent: EditIntent;
  risk: "read-only" | "writeback" | "destructive";
}

export const JEV_EVALUATION_DATASET: JevEvaluationExample[] = [
  {
    id: "geometry-ceiling-hosts",
    state: {
      request: "Move the selected ceiling down 150 mm with its hosted lights and air terminals.",
      stage: "stage2",
      selectedStepIds: [1109713],
      selectedGlobalIds: ["2B0HM50HKnsteHeL7LrcNv"],
      parsedParameters: { deltaZMm: -150 },
      evidence: [{ source: "edit_manifest.json", reference: "edit-20260917-ceiling-down-150mm" }],
      consequential: true,
    },
    expectedIntent: "modify_geometry",
    risk: "writeback",
  },
  {
    id: "attribute-tag-update",
    state: {
      request: "Change the selected element's fire rating property to 2 hours.",
      stage: "stage2",
      selectedStepIds: [1109713],
      parsedParameters: { property: "FireRating", value: "2 hours" },
      consequential: true,
    },
    expectedIntent: "modify_attribute",
    risk: "writeback",
  },
  {
    id: "graph-query",
    state: {
      request: "Show every hosted object linked to this ceiling and list its IFC GlobalId.",
      stage: "phase1",
      selectedStepIds: [1109713],
      consequential: false,
    },
    expectedIntent: "query_model",
    risk: "read-only",
  },
  {
    id: "missing-target",
    state: {
      request: "Move it down a bit.",
      stage: "stage2",
      consequential: true,
    },
    expectedIntent: "ambiguous",
    risk: "writeback",
  },
  {
    id: "delete-element",
    state: {
      request: "Delete the selected temporary device from the IFC model.",
      stage: "stage2",
      selectedStepIds: [1319365],
      consequential: true,
    },
    expectedIntent: "delete_element",
    risk: "destructive",
  },
];

export function evaluationCoverage(): {
  total: number;
  byIntent: Record<EditIntent, number>;
  hasWritebackCases: boolean;
  hasDestructiveCase: boolean;
} {
  const byIntent = Object.fromEntries(
    JEV_EVALUATION_DATASET.map((example) => [example.expectedIntent, 0]),
  ) as Record<EditIntent, number>;
  for (const example of JEV_EVALUATION_DATASET) byIntent[example.expectedIntent] += 1;
  return {
    total: JEV_EVALUATION_DATASET.length,
    byIntent,
    hasWritebackCases: JEV_EVALUATION_DATASET.some((example) => example.risk === "writeback"),
    hasDestructiveCase: JEV_EVALUATION_DATASET.some((example) => example.risk === "destructive"),
  };
}
