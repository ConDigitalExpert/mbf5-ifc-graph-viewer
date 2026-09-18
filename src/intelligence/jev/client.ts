import { TypeSafeClient, type EntryType, type SystemOneResult } from "@typesafe-ai/sdk";
import { applyJevPolicy } from "./policies.js";
import { JEV_QUESTIONS, type JevQuestionSet } from "./questions.js";
import type {
  EditIntent,
  EditRequestState,
  JevDecision,
  JevMode,
  RawJudgment,
} from "./decisions.js";
import { makeFailClosedDecision, stableStateReference } from "./fallbacks.js";

export interface JevClientOptions {
  mode?: JevMode;
  apiKey?: string;
  client?: TypeSafeClient;
  now?: string;
}

type JevResult = SystemOneResult<JevQuestionSet>;

function hasApiKey(apiKey?: string): boolean {
  return Boolean(apiKey?.trim() || process.env.TYPESAFE_API_KEY?.trim());
}

function probabilitiesForIntent(value: Record<string, number>): Record<EditIntent, number> {
  return {
    modify_geometry: Number(value.modify_geometry ?? 0),
    modify_attribute: Number(value.modify_attribute ?? 0),
    query_model: Number(value.query_model ?? 0),
    create_element: Number(value.create_element ?? 0),
    delete_element: Number(value.delete_element ?? 0),
    ambiguous: Number(value.ambiguous ?? 0),
  };
}

function toApiState(state: EditRequestState): EntryType {
  const boundedState = {
    request: state.request,
    stage: state.stage,
    selectedStepIds: state.selectedStepIds ?? [],
    selectedGlobalIds: state.selectedGlobalIds ?? [],
    modelSnapshot: state.modelSnapshot ?? {},
    parsedParameters: state.parsedParameters ?? {},
    evidence: state.evidence ?? [],
    consequential: state.consequential ?? true,
  };
  return JSON.parse(JSON.stringify(boundedState)) as EntryType;
}

function normalizeResult(result: JevResult): RawJudgment {
  const intent = result.answers.intent;
  const evidence = result.answers.evidenceSufficient;
  const specificity = result.answers.specificity;
  return {
    intent: {
      choice: intent.choice as EditIntent,
      confidence: intent.confidence,
      probabilities: probabilitiesForIntent(intent.probabilities as Record<string, number>),
    },
    evidenceSufficientProbability: evidence.noul,
    specificity: {
      score: specificity.score,
      confidence: specificity.confidence,
      probabilities: Object.fromEntries(
        Object.entries(specificity.probabilities).map(([key, value]) => [key, Number(value)]),
      ),
    },
  };
}

export async function evaluateEditRequest(
  state: EditRequestState,
  options: JevClientOptions = {},
): Promise<JevDecision> {
  const mode = options.mode ?? "shadow";
  const now = options.now ?? new Date().toISOString();
  const stateReference = stableStateReference(state);

  if (!options.client && !hasApiKey(options.apiKey)) {
    return makeFailClosedDecision(state, mode, "TYPESAFE_API_KEY is not configured", now);
  }

  const client = options.client ?? new TypeSafeClient({
    apiKey: options.apiKey,
    defaultModel: "jev-latest",
    timeout: 10_000,
  });
  try {
    const result = await client.systemOne({
      model: "jev-latest",
      state: toApiState(state),
      questions: JEV_QUESTIONS,
    });
    const judgment = normalizeResult(result);
    return {
      decisionId: `jev-${stateReference.slice(0, 16)}`,
      createdAt: now,
      mode,
      provider: "typesafe-jev",
      model: result.model,
      stateReference,
      state,
      judgment,
      policy: applyJevPolicy(judgment, mode),
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      },
    };
  } catch (error) {
    const providerMessage = error instanceof Error ? error.message : String(error);
    return makeFailClosedDecision(
      state,
      mode,
      `TypeSafe request failed: ${providerMessage}`,
      now,
    );
  }
}
