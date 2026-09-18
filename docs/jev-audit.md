# Jev Candidate Audit

This audit applies the TypeSafe decision tree to the current repository.

## A. Deterministic code should remain

- IFC and graph artifacts are read by exact file and JSON paths.
- STEP id and GlobalId selection, scene bridge lookup, graph edge traversal,
  source hashes, coordinate frames, unit conversions, and validation counts are
  deterministic.
- Viewer camera, hover, selection, filtering, highlighting, and navigation are
  deterministic UI behavior.
- Ceiling and hosted object translations are deterministic once the approved
  edit instruction has been resolved.
- IFC writeback, before and after hashes, preservation checks, recovery output,
  and validation are deterministic control-plane operations.

## B. Jev candidate selected for the first implementation

### `edit_request_intent`

- **State:** bounded user request plus selected STEP ids, GlobalIds, parsed
  parameters, model source hash, evidence references, and consequence flag.
- **Question:** which known operation does the request intend?
- **Primitive:** Choice.
- **Outputs:** geometry, attribute, query, create, delete, or ambiguous.
- **Confidence:** Choice confidence plus the full probability distribution.
- **Threshold:** `0.50` low-confidence floor; `0.90` for read-only autonomous
  routing; writeback never becomes autonomous through Jev confidence alone.
- **Fallback:** clarify or route to human review; never guess a target or mutate
  IFC.
- **Incorrect decision consequence:** an incorrect route could show the wrong
  data or send a consequential request into a writeback workflow. The policy
  therefore keeps all writes human-gated.
- **Expected frequency:** once per natural-language Stage 2 request, with no
  repeated calls during deterministic geometry propagation.
- **Evaluation dataset:** `JEV_EVALUATION_DATASET` contains geometry,
  attribute, query, ambiguous, and destructive examples with expected labels.

### `evidence_sufficient`

- **State:** the same bounded request and evidence references.
- **Question:** is the evidence sufficient to plan without inventing model facts?
- **Primitive:** Noul.
- **Threshold:** probability of yes at least `0.90`.
- **Fallback:** request missing identity, parameter, relationship, or provenance
  evidence.

### `request_specificity`

- **State:** the same request and parsed parameter summary.
- **Question:** how specifically are operation, target, parameters, units, and
  scope expressed?
- **Primitive:** Score with four ordered levels from ambiguous to fully specified.
- **Threshold:** score `2` is the minimum for planning; deterministic code still
  validates units, ranges, identity, and relationship scope.

## C. Reasoning model required

- Interpreting the complete coordination context across IFC, graph, systems,
  geometry, and edit evidence.
- Calculating a proposed geometry or attribute change when the operation is
  approved and all required evidence is present.
- Producing a proposed edit manifest and explaining conflicts or unsupported
  mappings.

The reasoning layer may propose work. It cannot write IFC or authorize it.

## D. Human decision required

- Applying geometry or attribute writeback to the IFC clone.
- Creating or deleting model content.
- Resolving contradictory model evidence or ambiguous authority.
- Publishing or replacing a shared model artifact when the change is
  consequential.
