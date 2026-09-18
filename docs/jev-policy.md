# Jev Decision Architecture

This is the canonical policy for semantic decisions in the MBF5 BIM viewer and
its future Stage 2 writeback services. Codex and Claude Code are interchangeable
builders. Jev is a bounded judgment service. Deterministic code owns validation,
thresholds, state transitions, permissions, side effects, and IFC writeback.
Human approval remains authoritative for consequential model changes.

## Boundary

Use ordinary code for:

- IFC parsing, STEP and GlobalId lookups, graph traversal, coordinate math, unit
  conversion, hashes, validation, serialization, and exact thresholds.
- Camera behavior, selection, scene identity mapping, manifest generation, and
  all viewer side effects.
- IFC cloning and writeback after an explicitly approved edit manifest.

Use Jev only for a narrow semantic judgment with predefined outputs. The first
decision contract is `edit_request_intent`:

- `modify_geometry`
- `modify_attribute`
- `query_model`
- `create_element`
- `delete_element`
- `ambiguous`

The same request also receives an evidence sufficiency Noul and a specificity
Score. They are independent questions over the same bounded state and are
batched in one TypeSafe request.

## BIM state contract

The state passed to Jev contains the user request, phase or stage, selected IFC
STEP ids and GlobalIds, the model source hash and graph revision when known,
already parsed parameters, traceable evidence references, and whether the
request is consequential. It must not contain secrets or an unbounded model
dump. Full IFC facts remain available to deterministic code and the reasoning
layer through explicit provenance references.

## Policy and thresholds

The current experimental thresholds are defined in
`src/intelligence/jev/thresholds.ts` and are not TypeSafe defaults:

- below `0.50` intent confidence: low confidence, clarify or escalate;
- `0.50` to below `0.90`: assisted review or reasoning route;
- at least `0.90` intent confidence plus at least `0.90` evidence sufficiency:
  eligible for a read-only deterministic query route;
- specificity below score `2`: clarify before planning;
- geometry and attribute writeback always route through reasoning, validation,
  an edit manifest, and explicit human approval;
- create and delete operations always require human review.

Confidence is a control signal, not authorization. Policy code owns the action.
Jev cannot apply an IFC edit, change a permission, execute a destructive command,
or bypass validation.

## Deployment stages

### Shadow mode

`evaluateEditRequest(..., { mode: "shadow" })` records the Jev recommendation
and policy result while the existing application route remains in control. Log
accuracy, false positives and negatives, confidence calibration, latency, cost,
fallback rate, and performance by intent.

### Assisted mode

Jev produces a typed recommendation. A reasoning client may prepare a proposed
edit manifest or query plan. Deterministic validation and a human review gate
must complete before any writeback.

### Selective autonomy

Only validated, low-risk, read-only query classes may be routed automatically.
Any geometry, attribute, create, or delete operation remains gated by the
deterministic policy and explicit human authorization.

## Telemetry

Each decision should record:

- decision id and creation time;
- provider and model version;
- stable state reference and IFC source hash when available;
- mode, typed output, complete probability distribution, and confidence;
- applied threshold and policy action;
- fallback reason, if any;
- eventual reviewed or executed outcome when available.

The telemetry helper writes JSON Lines only when the caller explicitly supplies
a path. Do not log API keys or full IFC payloads.

## Shared agent instructions

- Codex: invoke the installed skill with `$typesafe-ai` when designing or
  changing Jev workflows.
- Claude Code: invoke `/typesafe:typesafe-ai` when designing or changing Jev
  workflows.
- Both agents must read this file, keep the application contract identical, and
  make only thin tool-specific instruction changes.

## Review checklist

Before adding a new Jev question, document its bounded outputs, state fields,
confidence signal, threshold, fallback, incorrect-decision consequence, expected
frequency, and labeled evaluation dataset. Keep deterministic parsing and BIM
geometry reasoning out of the Jev question.
