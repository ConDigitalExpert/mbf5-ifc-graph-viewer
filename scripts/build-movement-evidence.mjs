#!/usr/bin/env node
/** Publish placement facts from an existing independent audit; never recompute/edit IFC. */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMovementLookup } from "../dist/viewer-semantics.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function requireFact(value, message) { if (!value) throw new Error(message); }

export function buildMovementEvidence({ audit, identity, manifest, auditSha256, identitySha256, manifestSha256 }) {
  requireFact(audit.schema === "velocity.placement_audit.v1" && audit.passed === true, "Independent placement audit must pass");
  const matching = audit.cases.filter((row) => row.candidate_sha256 === identity.source_sha256 && row.source_sha256 === manifest.source?.sha256);
  requireFact(matching.length === 1, "Exactly one audit case must match both IFC hashes");
  const row = matching[0];
  requireFact(row.passed === true && Array.isArray(row.mismatches) && row.mismatches.length === 0, "Matching placement audit must have no mismatches");
  requireFact(manifest.status === "applied" && manifest.output?.sha256 === identity.source_sha256, "Applied edit manifest must match the displayed IFC");
  requireFact(identity.products.length === row.products_compared && manifest.source.product_count === row.products_compared && manifest.output.product_count === row.products_compared, "Audit must cover the complete product inventory");
  requireFact(Array.isArray(row.expected_translation_m) && row.expected_translation_m.length === 3 && row.expected_translation_m.every(Number.isFinite), "Audit translation must be finite");
  const delta = row.expected_translation_m.map((value) => value * 1000);
  const movedIds = new Set(row.moved_global_ids);
  requireFact(movedIds.size === row.moved_products && row.moved_global_ids.length === row.moved_products && manifest.summary.moved_products === row.moved_products, "Moved-product counts must agree");
  const edits = new Map();
  for (const operation of manifest.operations) {
    requireFact(operation.operation === "update_placement" && operation.status === "applied" && operation.details?.rotation_quaternion == null && JSON.stringify(operation.details.translation_m) === JSON.stringify(row.expected_translation_m), "Only the independently audited translation is supported");
    for (const target of operation.targets) {
      requireFact(target.change === "changed" && !edits.has(target.global_id), "Direct edit identities must be unique and changed");
      edits.set(target.global_id, { global_id: target.global_id, classification: "direct", delta_mm: delta, reason: `Edit instruction ${operation.op_id}; independently checked world placement` });
    }
  }
  requireFact(edits.size === manifest.summary.direct_targets, "Direct edit count differs from summary");
  for (const propagated of manifest.propagated) {
    requireFact(propagated.change === "changed" && !edits.has(propagated.global_id), "Propagated edit identities must be unique and changed");
    edits.set(propagated.global_id, { global_id: propagated.global_id, classification: "propagated", delta_mm: delta, reason: `Propagation: ${propagated.reason}; independently checked world placement` });
  }
  requireFact(manifest.propagated.length === manifest.summary.propagated && edits.size === movedIds.size && [...edits.keys()].every((id) => movedIds.has(id)), "Edit targets and independent moved-product identities must agree exactly");
  const evidence = {
    schema: "velocity.viewer_placement_evidence.v1",
    scope: "world_placement_only",
    candidate_only: true,
    approval: "not_granted",
    source_sha256: row.source_sha256,
    candidate_sha256: row.candidate_sha256,
    products_compared: row.products_compared,
    moved_products: row.moved_products,
    translation_tolerance_m: row.tolerance_m,
    audit: { url: "data/velocity-pilot/placement-audit.json", sha256: auditSha256, passed: true, slurm_job_id: audit.slurm_job_id, script_sha256: audit.script_sha256, configuration_sha256: audit.configuration_sha256 },
    inputs: { identity_sha256: identitySha256, edit_manifest_sha256: manifestSha256 },
    products: identity.products.map((product) => [product.ifc_step_id, product.ifc_global_id]).sort((a, b) => a[0] - b[0]),
    moved: [...edits.values()].sort((a, b) => a.global_id.localeCompare(b.global_id)),
  };
  const check = createMovementLookup(evidence, { candidateSha256: row.candidate_sha256, sourceSha256: row.source_sha256 });
  requireFact(check.valid, check.reason);
  return evidence;
}

async function main() {
  const args = process.argv.slice(2);
  requireFact(args.length === 4, "Usage: node scripts/build-movement-evidence.mjs AUDIT_JSON IDENTITY_JSON EDIT_MANIFEST_JSON OUTPUT_JSON");
  const [auditBytes, identityBytes, manifestBytes] = await Promise.all(args.slice(0, 3).map((path) => readFile(path)));
  const evidence = buildMovementEvidence({ audit: JSON.parse(auditBytes), identity: JSON.parse(identityBytes), manifest: JSON.parse(manifestBytes), auditSha256: sha(auditBytes), identitySha256: sha(identityBytes), manifestSha256: sha(manifestBytes) });
  const output = resolve(args[3]);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
  await writeFile(resolve(dirname(output), "placement-audit.json"), auditBytes);
  console.log(JSON.stringify({ output, products_compared: evidence.products_compared, moved_products: evidence.moved_products, source_sha256: evidence.source_sha256, candidate_sha256: evidence.candidate_sha256 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
