import { choice, noul, score } from "@typesafe-ai/sdk";

export const editIntentQuestion = choice(
  "What operation does this BIM request intend? Choose one bounded operation. Use ambiguous when the operation, target, or requested change cannot be identified from the supplied state.",
  {
    modify_geometry: "Move, rotate, resize, replace, or otherwise change the geometry or placement of existing IFC elements.",
    modify_attribute: "Change a named IFC attribute, property, classification, tag, or other non-geometric value.",
    query_model: "Read, inspect, filter, explain, or validate the existing IFC model without changing it.",
    create_element: "Create a new IFC element or model object.",
    delete_element: "Delete or remove an existing IFC element or model object.",
    ambiguous: "The request does not contain enough semantic information to select one operation safely.",
  },
);

export const evidenceSufficientQuestion = noul(
  "Is the supplied state sufficient for a reasoning agent to plan the requested BIM operation without inventing model facts?",
  {
    true: "The request, target identity, parameters, and relevant IFC or graph evidence are present and consistent.",
    false: "A target, parameter, provenance link, or required relationship is missing, contradictory, or only guessed.",
  },
);

export const requestSpecificityQuestion = score(
  "How specifically does the request identify the operation, target, parameters, units, and scope?",
  [
    "Ambiguous or contradictory: the operation or target cannot be safely identified.",
    "Partially specified: an operation is suggested, but target, parameter, or scope needs interpretation.",
    "Actionable with deterministic validation: operation and target are clear, with enough parameters to plan the next step.",
    "Fully specified: operation, stable target identity, parameter values, units, and scope are explicit.",
  ] as const,
);

export const JEV_QUESTIONS = {
  intent: editIntentQuestion,
  evidenceSufficient: evidenceSufficientQuestion,
  specificity: requestSpecificityQuestion,
} as const;

export type JevQuestionSet = typeof JEV_QUESTIONS;
