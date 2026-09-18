import assert from "node:assert/strict";
import test from "node:test";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { evaluateEditRequest } from "../src/intelligence/jev/client.js";
import { makeFailClosedDecision, stableStateReference } from "../src/intelligence/jev/fallbacks.js";
import { JEV_EVALUATION_DATASET, evaluationCoverage } from "../src/intelligence/jev/evaluations.js";
import { applyJevPolicy } from "../src/intelligence/jev/policies.js";
import type { RawJudgment } from "../src/intelligence/jev/decisions.js";

const geometryJudgment: RawJudgment = {
  intent: {
    choice: "modify_geometry",
    confidence: 0.96,
    probabilities: {
      modify_geometry: 0.96,
      modify_attribute: 0.01,
      query_model: 0.01,
      create_element: 0.005,
      delete_element: 0.005,
      ambiguous: 0.01,
    },
  },
  evidenceSufficientProbability: 0.98,
  specificity: {
    score: 3,
    confidence: 0.94,
    probabilities: { "0": 0.01, "1": 0.01, "2": 0.03, "3": 0.95 },
  },
};

test("writeback routes remain human gated even with high confidence", () => {
  const policy = applyJevPolicy(geometryJudgment, "selective-autonomy");
  assert.equal(policy.action, "route_reasoning");
  assert.equal(policy.requiresHumanApproval, true);
});

test("shadow mode never controls the application", () => {
  const policy = applyJevPolicy(geometryJudgment, "shadow");
  assert.equal(policy.action, "observe_only");
});

test("missing provider credentials fail closed", () => {
  const state = JEV_EVALUATION_DATASET[0].state;
  const decision = makeFailClosedDecision(
    state,
    "assisted",
    "test provider unavailable",
    "2026-09-18T00:00:00.000Z",
  );
  assert.equal(decision.provider, "fallback");
  assert.equal(decision.policy.action, "request_clarification");
  assert.equal(decision.policy.requiresHumanApproval, true);
});

test("provider judgments are normalized and policy gated", async () => {
  const fakeClient = {
    systemOne: async () => ({
      model: "jev-test",
      answers: {
        intent: {
          type: "choice" as const,
          choice: "modify_geometry" as const,
          confidence: 0.96,
          probabilities: {
            modify_geometry: 0.96,
            modify_attribute: 0.01,
            query_model: 0.01,
            create_element: 0.005,
            delete_element: 0.005,
            ambiguous: 0.01,
          },
        },
        evidenceSufficient: { type: "noul" as const, noul: 0.98 },
        specificity: {
          type: "score" as const,
          score: 3,
          confidence: 0.94,
          legend: { "0": "ambiguous", "1": "partial", "2": "actionable", "3": "fully specified" },
          probabilities: { "0": 0.01, "1": 0.01, "2": 0.03, "3": 0.95 },
        },
      },
      usage: { input_tokens: 10, output_tokens: 8 },
    }),
  } as unknown as TypeSafeClient;

  const decision = await evaluateEditRequest(JEV_EVALUATION_DATASET[0].state, {
    client: fakeClient,
    mode: "selective-autonomy",
    now: "2026-09-18T00:00:00.000Z",
  });
  assert.equal(decision.provider, "typesafe-jev");
  assert.equal(decision.judgment?.intent.choice, "modify_geometry");
  assert.equal(decision.policy.action, "route_reasoning");
  assert.equal(decision.policy.requiresHumanApproval, true);
});

test("provider failures fail closed", async () => {
  const failingClient = {
    systemOne: async () => {
      throw new Error("connection unavailable");
    },
  } as unknown as TypeSafeClient;

  const decision = await evaluateEditRequest(JEV_EVALUATION_DATASET[0].state, {
    client: failingClient,
    mode: "assisted",
    now: "2026-09-18T00:00:00.000Z",
  });
  assert.equal(decision.provider, "fallback");
  assert.equal(decision.policy.action, "request_clarification");
  assert.match(decision.fallbackReason ?? "", /connection unavailable/);
});

test("state references are stable across object key order", () => {
  const first = {
    request: "x",
    stage: "phase1" as const,
    modelSnapshot: { graphRevision: "a", elementCount: 1 },
  };
  const second = {
    modelSnapshot: { elementCount: 1, graphRevision: "a" },
    stage: "phase1" as const,
    request: "x",
  };
  assert.equal(stableStateReference(first), stableStateReference(second));
});

test("evaluation data covers a writeback and destructive case", () => {
  const coverage = evaluationCoverage();
  assert.equal(coverage.total, JEV_EVALUATION_DATASET.length);
  assert.equal(coverage.hasWritebackCases, true);
  assert.equal(coverage.hasDestructiveCase, true);
  assert.ok(coverage.byIntent.modify_geometry >= 1);
  assert.ok(coverage.byIntent.ambiguous >= 1);
});
