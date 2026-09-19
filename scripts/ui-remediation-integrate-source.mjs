import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distData = path.join(repoRoot, "dist", "data");
const stagedRoot = path.resolve(repoRoot, "..", "coordination_remediation", "delivery", "staged_source");
const stagedData = path.join(stagedRoot, "viewer", "data");
const acceptanceReport = path.resolve(repoRoot, "..", "coordination_remediation", "independent_review", "independent_acceptance_audit.v1.json");
const mappingSource = path.join(stagedRoot, "comparison_source_mapping.v1.json");

const immutableOriginalSha = "b50ea1aa9fefc232b8bf485388245111e6d6bf011eb7ebdaf180096ba162a1ea";
const currentCandidateSha = "1448f524ce0d5c53ff3afcca7ac515024c538cfa71623282f560e98fe163e90e";
const currentCandidateGlbExpectedSha = "fb0f4623c534e60404d443686fe6909200e50566061f56f8ba0889317dcaf9cd";

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertHash(filePath, expected) {
  const actual = sha256(filePath);
  if (actual !== expected) throw new Error(`${filePath} hash ${actual} does not match expected ${expected}`);
  return actual;
}

function copyChecked(sourceRelative, destinationName, expectedHash) {
  const source = path.join(stagedRoot, sourceRelative);
  const destination = path.join(distData, destinationName);
  assertHash(source, expectedHash);
  fs.copyFileSync(source, destination);
  const copiedHash = assertHash(destination, expectedHash);
  return { source: sourceRelative, path: `data/${destinationName}`, sha256: copiedHash, bytes: fs.statSync(destination).size };
}

const sourceFiles = {
  archive: copyChecked("viewer/data/MBF5-TEST-COORDINATION.ifc.gz", "MBF5-TEST-COORDINATION.original.ifc.gz", "934a562efeaa42542bb15885c102001f480f30b5aa344b3efb9c538d8ecb91c5"),
  geometry: copyChecked("viewer/data/MBF5-TEST-COORDINATION.scene.glb", "MBF5-TEST-COORDINATION.original.scene.glb", "234fab4d1b291496aee192bee7813e2eff44fe7537fbe474ed5090c78e5407a0"),
  geometryManifest: copyChecked("viewer/data/MBF5-TEST-COORDINATION.scene.manifest.json", "MBF5-TEST-COORDINATION.original.scene.manifest.json", "bfa5d33247afc4489ab67b6f2ebda7dfcbe47e39e09c0ce1f27d1d45f8c2ae13"),
  bridge: copyChecked("viewer/data/MBF5-TEST-COORDINATION.scene_bridge.json", "MBF5-TEST-COORDINATION.original.scene_bridge.json", "3e9660307b142262593a07af3a113da7737456939bb9e77b55a4cc445482d21f"),
  bridgeIndex: copyChecked("viewer/data/MBF5-TEST-COORDINATION.scene_bridge_index.json", "MBF5-TEST-COORDINATION.original.scene_bridge_index.json", "34219050918428015a4088a73a80cf95dad1e2601a66a5def363327357e35a6a"),
  validation: copyChecked("viewer/data/MBF5-TEST-COORDINATION.scene.validation.json", "MBF5-TEST-COORDINATION.original.scene.validation.json", "e1cae61cdde2e1737d132006cd1b6fa335cf27d0d3a6addb09080091bbf77633"),
  graphManifest: copyChecked("ifc_phase1_knowledge_graph/graph_manifest.json", "MBF5-TEST-COORDINATION.original.graph_manifest.json", "467c397ada61b3b5e0610a4738d13f7ad6d239a9b1451e3895b02ff149690583")
};
const currentCandidateGlbPath = path.join(distData, "MBF5-TEST-COORDINATION.hallway-coordination.scene.glb");
const currentCandidateGlbSha = assertHash(currentCandidateGlbPath, currentCandidateGlbExpectedSha);

const stagedMappingHash = assertHash(mappingSource, "61fe2f54e7a9ea728ee157b7bf6178a7d02008751fd376f52217c8891e6dfbe7");
const acceptanceReportHash = assertHash(acceptanceReport, "e43104f78d97cd3e44358639dcf995d2c961b3e0c24fc1e9430918981c5f5c7c");

const stagedMapping = readJson(mappingSource);
const integratedMapping = structuredClone(stagedMapping);
integratedMapping.status = "integrated_in_viewer";
integratedMapping.purpose = "Corrected source/current selector map for the before/after viewer; the immutable source is integrated under explicit original asset names while the candidate remains pending handoff.";
integratedMapping.source_mapping_sha256 = stagedMappingHash;
integratedMapping.integration = {
  status: "accepted_true_original_source_only",
  candidate_status: "candidate_handoff_pending",
  accepted_source_sha256: immutableOriginalSha,
  accepted_source_review: "Independent reviewer accepted staged true-original bytes, hashes, identity, and coordinate validation; noDraco remains an explicit browser warning.",
  browser_assets: sourceFiles,
  acceptance_report_path: "../coordination_remediation/independent_review/independent_acceptance_audit.v1.json",
  acceptance_report_sha256: acceptanceReportHash
};
integratedMapping.selectors.original.intended_viewer_urls = {
  model: sourceFiles.archive.path,
  geometry: sourceFiles.geometry.path,
  manifest: sourceFiles.geometryManifest.path,
  bridge: sourceFiles.bridge.path,
  bridge_index: sourceFiles.bridgeIndex.path
};
integratedMapping.selectors.original.staged_ifc_copy = "coordination_remediation/delivery/staged_source/MBF5-TEST-COORDINATION.ifc";
integratedMapping.selectors.original.integrated_ifc_archive = sourceFiles.archive.path;
integratedMapping.selectors.original.integrated_geometry = sourceFiles.geometry.path;
integratedMapping.selectors.original.integrated_scene_validation = sourceFiles.validation.path;
integratedMapping.selectors.original.ifc_sha256 = immutableOriginalSha;
integratedMapping.selectors.original.browser_geometry_sha256 = sourceFiles.geometry.sha256;
integratedMapping.selectors.current.ifc_sha256 = currentCandidateSha;
integratedMapping.selectors.current.browser_geometry_sha256 = currentCandidateGlbSha;
writeJson(path.join(distData, "comparison_source_mapping.v1.staged.json"), stagedMapping);
writeJson(path.join(distData, "comparison_source_mapping.v1.json"), integratedMapping);

const viewerIndex = readJson(path.join(stagedData, "viewer_index.json"));
const originalUrlMap = new Map([
  ["data/MBF5-TEST-COORDINATION.ifc.gz", sourceFiles.archive.path],
  ["data/MBF5-TEST-COORDINATION.scene.glb", sourceFiles.geometry.path],
  ["data/MBF5-TEST-COORDINATION.scene.manifest.json", sourceFiles.geometryManifest.path],
  ["data/MBF5-TEST-COORDINATION.scene_bridge.json", sourceFiles.bridge.path],
  ["data/MBF5-TEST-COORDINATION.scene_bridge_index.json", sourceFiles.bridgeIndex.path]
]);
for (const key of ["model_url", "source_model_archive_url", "geometry_url", "geometry_manifest_url", "scene_bridge_url", "scene_bridge_index_url"]) {
  if (originalUrlMap.has(viewerIndex[key])) viewerIndex[key] = originalUrlMap.get(viewerIndex[key]);
}
viewerIndex.integration_status = "accepted_true_original_source_only";
viewerIndex.source_sha256 = immutableOriginalSha;
fs.writeFileSync(path.join(distData, "MBF5-TEST-COORDINATION.original.viewer_index.json"), JSON.stringify(viewerIndex));
const originalViewerIndexHash = sha256(path.join(distData, "MBF5-TEST-COORDINATION.original.viewer_index.json"));

const comparisonIndexPath = path.join(distData, "comparison_index.json");
const comparisonIndex = readJson(comparisonIndexPath);
const source = comparisonIndex.authoritative_source;
const sourceGeometry = source.browser_geometry;
source.label = "Immutable original IFC source model · accepted source bundle";
source.ifc_sha256 = immutableOriginalSha;
source.source_bundle_status = "accepted_true_original_source_only";
source.mapping_status = "verified";
source.scene_mapping_status = "verified true-original source mapping";
source.staged_ifc_copy = "coordination_remediation/delivery/staged_source/MBF5-TEST-COORDINATION.ifc";
source.source_archive_url = sourceFiles.archive.path;
source.scene_bridge_url = sourceFiles.bridge.path;
source.scene_bridge_index_url = sourceFiles.bridgeIndex.path;
source.scene_validation_url = sourceFiles.validation.path;
source.source_mapping_url = "data/comparison_source_mapping.v1.json";
source.integration_manifest_url = "data/source_bundle_integration.v1.json";
sourceGeometry.url = sourceFiles.geometry.path;
sourceGeometry.manifest_url = sourceFiles.geometryManifest.path;
sourceGeometry.sha256 = sourceFiles.geometry.sha256;
sourceGeometry.ifc_sha256 = immutableOriginalSha;
sourceGeometry.glb_sha256 = sourceFiles.geometry.sha256;
sourceGeometry.mesh_elements = 3648;
sourceGeometry.mapped_mesh_elements = 3648;
sourceGeometry.identity = "glTF node name id-<IFC STEP id> with scene bridge extras";
sourceGeometry.provenance_status = "verified true-original source bundle";
sourceGeometry.mapping_status = "verified";
sourceGeometry.scene_mapping_status = "verified";
sourceGeometry.identity_properties = [
  "ifc_step_id",
  "ifc_global_id",
  "ifc_entity_type",
  "ifc_graph_node",
  "ifc_source_sha256",
  "bim_geometry_id",
  "bim_usd_prim_path",
  "bim_editable_geometry",
  "bim_writeback_strategy"
];
sourceGeometry.coordinate_frame = {
  coordinate_mode: "local model coordinates; world = local + model_origin_m",
  model_origin_m: [504265.9855, 5142047.22375, 237.105],
  model_offset_m: [-504265.9855, -5142047.22375, -237.105]
};
const revised = comparisonIndex.revised_model;
revised.ifc_sha256 = currentCandidateSha;
revised.acceptance_status = "candidate_handoff_pending";
revised.browser_geometry.provenance_status = "candidate handoff pending";
revised.browser_geometry.ifc_sha256 = currentCandidateSha;
revised.browser_geometry.glb_sha256 = currentCandidateGlbSha;
revised.browser_geometry.sha256 = currentCandidateGlbSha;
comparisonIndex.source_integration = {
  status: "accepted_true_original_source_only",
  source_sha256: immutableOriginalSha,
  candidate_sha256: currentCandidateSha,
  source_ifc_sha256: immutableOriginalSha,
  source_glb_sha256: sourceFiles.geometry.sha256,
  candidate_ifc_sha256: currentCandidateSha,
  candidate_glb_sha256: currentCandidateGlbSha,
  candidate_acceptance_status: "pending",
  staged_mapping_sha256: stagedMappingHash,
  acceptance_report_path: "../coordination_remediation/independent_review/independent_acceptance_audit.v1.json",
  acceptance_report_sha256: acceptanceReportHash,
  copied_assets: sourceFiles,
  source_viewer_index: { path: "data/MBF5-TEST-COORDINATION.original.viewer_index.json", sha256: originalViewerIndexHash },
  no_draco_warning: "The accepted source browser GLB uses uncompressed primitives; no KHR_draco_mesh_compression extension is required."
};
comparisonIndex.quarantined_legacy_source = {
  status: "preserved_not_authoritative",
  branch_identity: "stage2_ceiling_down_150mm",
  source_sha256: "5a6e38fac83139580949c30ae988cbff532aeaedb8d37aeea5705e9d78035807",
  files: {
    archive: "data/MBF5-TEST-COORDINATION.ifc.gz",
    geometry: "data/MBF5-TEST-COORDINATION.glb",
    manifest: "data/MBF5-TEST-COORDINATION.manifest.json",
    bridge: "data/MBF5-TEST-COORDINATION.scene_bridge.json",
    bridge_index: "data/MBF5-TEST-COORDINATION.scene_bridge_index.json"
  },
  reason: "Existing generic files are retained as historical ceiling-down payloads and are excluded from authoritative before/after source selection."
};
writeJson(comparisonIndexPath, comparisonIndex);

const legacyFiles = [
  "MBF5-TEST-COORDINATION.ifc.gz",
  "MBF5-TEST-COORDINATION.glb",
  "MBF5-TEST-COORDINATION.manifest.json",
  "MBF5-TEST-COORDINATION.scene.glb",
  "MBF5-TEST-COORDINATION.scene.manifest.json",
  "MBF5-TEST-COORDINATION.scene_bridge.json",
  "MBF5-TEST-COORDINATION.scene_bridge_index.json",
  "MBF5-TEST-COORDINATION.scene.validation.json"
].filter((name) => fs.existsSync(path.join(distData, name)));
const legacyHashes = Object.fromEntries(legacyFiles.map((name) => [name, sha256(path.join(distData, name))]));
const legacyProvenance = {
  schema: "bim-viewer-legacy-source-provenance-1",
  status: "preserved_quarantined_historical_snapshot",
  branch_identity: "stage2_ceiling_down_150mm",
  source_sha256: "5a6e38fac83139580949c30ae988cbff532aeaedb8d37aeea5705e9d78035807",
  authoritative_source_sha256: immutableOriginalSha,
  authoritative_source: false,
  reason: "These generic filenames predate the accepted source integration. Their bytes identify the ceiling-down branch and remain available for history/debugging only.",
  files: legacyHashes,
  comparison_index_before_integration_sha256: "93a20591224a75f04b097c7b43f04b8c8d424aa833b3bf3f2080c1a7137492a3"
};
writeJson(path.join(distData, "MBF5-TEST-COORDINATION.ceiling-down-150mm.legacy.provenance.json"), legacyProvenance);

const integrationManifest = {
  schema: "bim-viewer-source-integration-1",
  status: "accepted_true_original_source_only",
  generated_at_utc: new Date().toISOString(),
  source_acceptance_status: "accepted_true_original_bundle",
  candidate_acceptance_status: "pending",
  immutable_original: { sha256: immutableOriginalSha, ifc_sha256: immutableOriginalSha, glb_sha256: sourceFiles.geometry.sha256, ifc_schema: "IFC2X3", identity_nodes: 3648 },
  current_candidate: { sha256: currentCandidateSha, ifc_sha256: currentCandidateSha, glb_sha256: currentCandidateGlbSha, status: "candidate handoff pending" },
  staged_mapping: { path: "coordination_remediation/delivery/staged_source/comparison_source_mapping.v1.json", sha256: stagedMappingHash },
  acceptance_report: { path: "coordination_remediation/independent_review/independent_acceptance_audit.v1.json", sha256: acceptanceReportHash, overall_decision: "candidate pending; source bundle accepted by reviewer update" },
  assets: sourceFiles,
  original_viewer_index: { path: "data/MBF5-TEST-COORDINATION.original.viewer_index.json", sha256: originalViewerIndexHash },
  legacy_source: { path: "data/MBF5-TEST-COORDINATION.ceiling-down-150mm.legacy.provenance.json", status: "preserved_not_authoritative" },
  policy: { copied_full_entity_graph: false, copied_usdc: false, copied_uncompressed_ifc: false, browser_compression: "uncompressed GLB primitives; no Draco" }
};
writeJson(path.join(distData, "source_bundle_integration.v1.json"), integrationManifest);

for (const [name, before] of Object.entries(legacyHashes)) {
  const after = sha256(path.join(distData, name));
  if (after !== before) throw new Error(`Legacy snapshot changed unexpectedly: ${name}`);
}

console.log(JSON.stringify({
  status: integrationManifest.status,
  copied: Object.values(sourceFiles).map((asset) => asset.path),
  source_sha256: immutableOriginalSha,
  candidate_status: integrationManifest.candidate_acceptance_status,
  legacy_preserved: legacyFiles.length,
  full_entity_graph_copied: false
}, null, 2));
