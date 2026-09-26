import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildLevelMembership, createMovementLookup } from "../dist/viewer-semantics.js";
import { buildMovementEvidence } from "../scripts/build-movement-evidence.mjs";

const product = (step_id, name = "Misleading MAIN FLOOR element", entity_type = "IfcSlab") => ({ step_id, name, entity_type, global_id: `gid-${step_id}` });
const edge = (source_step_id, target_step_id, predicate = "contained_in", relationship_type = "IfcRelContainedInSpatialStructure") => ({ source_step_id, target_step_id, predicate, relationship_type, relationship_step_id: source_step_id * 100 + target_step_id });
const storey = (step, name) => product(step, name, "IfcBuildingStorey");
const sourceSha = "a".repeat(64); const candidateSha = "b".repeat(64);
const context = { sourceSha256: sourceSha, candidateSha256: candidateSha };
const fixture = () => ({ schema: "velocity.viewer_placement_evidence.v1", scope: "world_placement_only", source_sha256: sourceSha, candidate_sha256: candidateSha, audit: { passed: true, sha256: "c".repeat(64) }, products_compared: 3, moved_products: 2, translation_tolerance_m: 1e-6, products: [[1, "gid-1"], [2, "gid-2"], [3, "gid-3"]], moved: [{ global_id: "gid-1", classification: "direct", delta_mm: [0, 0, -150] }, { global_id: "gid-2", classification: "propagated", delta_mm: [0, 0, -150] }] });

test("storey names come from IFC containment, not product names", () => {
  const membership = buildLevelMembership([product(1), product(2), storey(10, "Actual storey")], [edge(1, 10)]);
  assert.equal(membership.forNode(1).label, "Actual storey");
  assert.equal(membership.forNode(2).label, "UNASSIGNED");
  assert.equal(membership.forNode(1).provenance, "Explicit IFC spatial containment");
  assert.equal(membership.forNode(1).storeys[0].path[0].relationship_step_id, 110);
});

test("decomposition and nested ports inherit their explicit host storey", () => {
  const membership = buildLevelMembership([product(1), product(2), product(3, "port", "IfcDistributionPort"), product(4), storey(10, "Ground")], [edge(1, 10), edge(1, 2, "aggregates", "IfcRelAggregates"), edge(3, 2, "port_serves_element", "IfcRelConnectsPortToElement"), edge(1, 4, "nests", "IfcRelNests")]);
  assert.equal(membership.forNode(2).label, "Ground");
  assert.match(membership.forNode(2).provenance, /decomposition/);
  assert.equal(membership.forNode(3).label, "Ground");
  assert.match(membership.forNode(3).provenance, /host relationships/);
  assert.equal(membership.forNode(4).label, "Ground");
});

test("coverings, openings and filling elements follow only explicit host edges", () => {
  const membership = buildLevelMembership([product(1), product(2, "cover", "IfcCovering"), product(3, "opening", "IfcOpeningElement"), product(4, "door", "IfcDoor"), storey(10, "Level A")], [edge(1, 10), edge(2, 1, "covering_of_element", "IfcRelCoversBldgElements"), edge(1, 3, "has_opening", "IfcRelVoidsElement"), edge(3, 4, "filled_by", "IfcRelFillsElement")]);
  for (const id of [2, 3, 4]) assert.equal(membership.forNode(id).label, "Level A");
});

test("direct containment takes precedence over conflicting host-derived labels", () => {
  const membership = buildLevelMembership([product(1), product(2), storey(10, "Own storey"), storey(20, "Host storey")], [edge(1, 10), edge(2, 20), edge(1, 2, "covering_of_element", "IfcRelCoversBldgElements")]);
  assert.deepEqual(membership.forNode(1).levels, ["Own storey"]);
});

test("ambiguous containment retains both storeys and matches each filter", () => {
  const membership = buildLevelMembership([product(1), storey(10, "A"), storey(20, "B")], [edge(1, 10), edge(1, 20)]);
  assert.deepEqual(membership.forNode(1).levels, ["A", "B"]);
  assert.equal(membership.matches(product(1), "A"), true);
  assert.equal(membership.matches(1, "B"), true);
  assert.equal(membership.matches(1, "C"), false);
});

test("same-named storeys group in filters without dropping their IFC identities", () => {
  const membership = buildLevelMembership([product(1), storey(10, "MAIN FLOOR"), storey(20, "MAIN FLOOR")], [edge(1, 10), edge(1, 20)]);
  assert.deepEqual(membership.levels, ["MAIN FLOOR"]);
  assert.deepEqual(membership.forNode(1).storeys.map((row) => row.step_id), [10, 20]);
});

test("cycles terminate and unrelated systems/properties cannot supply a storey", () => {
  const membership = buildLevelMembership([product(1), product(2), storey(10, "Roof")], [edge(1, 2, "aggregates", "IfcRelAggregates"), edge(2, 1, "aggregates", "IfcRelAggregates"), edge(1, 10, "member_of_group", "IfcRelAssignsToGroup"), edge(1, 10, "has_property_set", "IfcRelDefinesByProperties"), edge(1, 10, "contained_in", "WrongRelationship")]);
  assert.equal(membership.forNode(1).label, "UNASSIGNED");
  assert.equal(membership.forNode(999).label, "UNASSIGNED");
});

test("placement lookup distinguishes direct, propagated and unchanged placements", () => {
  const lookup = createMovementLookup(fixture(), context);
  assert.equal(lookup.valid, true);
  assert.equal(lookup.forNode(product(1)).classification, "direct");
  assert.equal(lookup.forNode(product(2)).classification, "propagated");
  assert.deepEqual(lookup.forNode(product(2)).delta_mm, [0, 0, -150]);
  assert.equal(lookup.forNode(product(3)).label, "Placement unchanged");
  assert.equal(lookup.forNode(product(3)).delta_mm, null);
  assert.equal(lookup.forNode(product(4)).status, "unknown");
  assert.equal(lookup.forNode({ ...product(1), step_id: 99 }).status, "unknown");
});

test("wrong candidate, wrong source and missing evidence fail closed", () => {
  assert.equal(createMovementLookup(null, context).forNode(product(1)).status, "unknown");
  assert.equal(createMovementLookup(fixture(), { ...context, candidateSha256: "d".repeat(64) }).valid, false);
  assert.equal(createMovementLookup(fixture(), { ...context, sourceSha256: "d".repeat(64) }).valid, false);
  assert.equal(createMovementLookup(fixture(), {}).valid, false);
});

test("incomplete or malformed audits never label unaudited nodes unchanged", () => {
  for (const mutate of [
    (e) => { e.audit.passed = false; }, (e) => { e.products_compared += 1; },
    (e) => { e.products[1] = e.products[0]; }, (e) => { e.moved[1] = e.moved[0]; },
    (e) => { e.moved[0].global_id = "outside-audit"; }, (e) => { e.moved[0].delta_mm[0] = Infinity; },
    (e) => { e.translation_tolerance_m = -1; }, (e) => { e.moved[0].classification = "guessed"; },
  ]) {
    const evidence = fixture(); mutate(evidence);
    assert.equal(createMovementLookup(evidence, context).forNode(product(3)).status, "unknown");
  }
});

const dataUrl = (name) => new URL(`../dist/data/velocity-pilot/${name}`, import.meta.url);
const [indexBytes, identityBytes, evidenceBytes, auditBytes, manifestBytes] = await Promise.all(["viewer_index.json", "identity.json", "movement-evidence.json", "placement-audit.json", "edit_manifest.json"].map((name) => readFile(dataUrl(name))));
const index = JSON.parse(indexBytes); const identity = JSON.parse(identityBytes); const evidence = JSON.parse(evidenceBytes); const audit = JSON.parse(auditBytes); const manifest = JSON.parse(manifestBytes);
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("actual MBF5 slab and lighting retain their correct MAIN FLOOR relationships", () => {
  const membership = buildLevelMembership(index.nodes, index.edges);
  assert.equal(membership.forNode(1319365).label, "MAIN FLOOR");
  assert.equal(membership.forNode(1319365).storeys[0].step_id, 1108208);
  assert.equal(membership.forNode(1029860).storeys[0].step_id, 995690);
  assert.equal(identity.products.filter((p) => p.geometry.represented && membership.matches(p.ifc_step_id, "MAIN FLOOR")).length, 997);
});

test("published evidence exactly reproduces from hash-bound audit and manifest", () => {
  const regenerated = buildMovementEvidence({ audit, identity, manifest, auditSha256: sha(auditBytes), identitySha256: sha(identityBytes), manifestSha256: sha(manifestBytes) });
  assert.deepEqual(evidence, regenerated);
  assert.equal(evidence.products_compared, 7542);
  assert.equal(evidence.moved.filter((row) => row.classification === "direct").length, 23);
  assert.equal(evidence.moved.filter((row) => row.classification === "propagated").length, 348);
});

test("real unchanged slab never receives the scenario translation", () => {
  const lookup = createMovementLookup(evidence, { candidateSha256: index.source_sha256, sourceSha256: index.stage2.parent_source_sha256 });
  const slab = index.nodes.find((node) => node.global_id === "32no_m1df8GAT28VN$V72v");
  const light = index.nodes.find((node) => node.global_id === "0kjDLHNd27y33KLQf3sdBV");
  assert.equal(lookup.forNode(slab).status, "unchanged");
  assert.equal(lookup.forNode(slab).delta_mm, null);
  assert.equal(lookup.forNode(light).classification, "propagated");
  assert.deepEqual(lookup.forNode(light).delta_mm, [0, 0, -150]);
});

test("generator rejects failed audits and identities omitted from the full comparison", () => {
  const inputs = { audit, identity, manifest, auditSha256: sha(auditBytes), identitySha256: sha(identityBytes), manifestSha256: sha(manifestBytes) };
  assert.throws(() => buildMovementEvidence({ ...inputs, audit: { ...audit, passed: false } }), /must pass/);
  assert.throws(() => buildMovementEvidence({ ...inputs, identity: { ...identity, products: identity.products.slice(1) } }), /complete product inventory/);
  assert.throws(() => buildMovementEvidence({ ...inputs, manifest: { ...manifest, output: { ...manifest.output, sha256: sourceSha } } }), /match the displayed IFC/);
});
