import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const distData = path.join(distRoot, "data");
const baseUrl = process.env.UI_REMEDIATION_BASE_URL || "http://127.0.0.1:4173";
const stagedUrl = process.env.UI_REMEDIATION_STAGED_URL || "http://127.0.0.1:4174";
let passed = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function getText(url) {
  const response = await fetch(url);
  check(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

async function head(url) {
  const response = await fetch(url, { method: "HEAD" });
  check(response.ok, `${url} returned ${response.status}`);
  return response;
}

const indexHtml = await getText(`${baseUrl}/index.html`);
const comparisonHtml = await getText(`${baseUrl}/comparison.html`);
const comparisonCss = await getText(`${baseUrl}/comparison.css?v=20260918-change15`);
const comparisonJs = await getText(`${baseUrl}/comparison.js?v=20260918-source1`);
const viewerJs = await getText(`${baseUrl}/viewer.js?v=20260919-saved-views1`);
const comparisonIndex = JSON.parse(await getText(`${baseUrl}/data/comparison_index.json`));
const integration = JSON.parse(await getText(`${baseUrl}/data/source_bundle_integration.v1.json`));
const mapping = JSON.parse(await getText(`${baseUrl}/data/comparison_source_mapping.v1.json`));
const validation = JSON.parse(await getText(`${baseUrl}/data/MBF5-TEST-COORDINATION.original.scene.validation.json`));

check(indexHtml.includes("Model intelligence workspace"), "main viewer HTML is served");
check(indexHtml.includes("saved-views1"), "main viewer uses the saved-view UI cache key");
check(indexHtml.includes("saved-view-dialog") && indexHtml.includes("saved-view-form") && indexHtml.includes("saved-view-name"), "main viewer exposes the accessible saved-view dialog");
check(comparisonHtml.includes("Before snapshot") && comparisonHtml.includes("After candidate"), "comparison keeps distinct before and candidate panes");
check(comparisonHtml.includes("before-provenance-label") && comparisonHtml.includes("graph-node-list"), "comparison exposes provenance and accessible graph selection hooks");
check(comparisonCss.includes("Avenir Next") && comparisonCss.includes("graph-node-list"), "premium comparison typography and graph selection styles are served");
check(comparisonJs.includes("Source scene mapping verified") && comparisonJs.includes("source mapping reviewed"), "comparison renders accepted source status dynamically");
check(viewerJs.includes("candidate handoff pending"), "main viewer keeps candidate acceptance status visible");
check(viewerJs.includes("openSavedViewDialog") && viewerJs.includes("commitSavedView") && !viewerJs.includes("window.prompt"), "saved views use an in-app dialog without native prompts");

const source = comparisonIndex.authoritative_source;
const sourceGeometry = source.browser_geometry;
const revised = comparisonIndex.revised_model;
check(source.sha256 === "b50ea1aa9fefc232b8bf485388245111e6d6bf011eb7ebdaf180096ba162a1ea", "comparison source IFC hash is immutable original");
check(source.ifc_sha256 === source.sha256, "comparison source exposes its IFC hash separately");
check(sourceGeometry.url === "data/MBF5-TEST-COORDINATION.original.scene.glb", "comparison selects the named true-original scene asset");
check(sourceGeometry.sha256 === "234fab4d1b291496aee192bee7813e2eff44fe7537fbe474ed5090c78e5407a0", "comparison records the accepted source GLB hash");
check(sourceGeometry.ifc_sha256 === source.sha256 && sourceGeometry.glb_sha256 === sourceGeometry.sha256, "source browser geometry separates IFC and GLB byte hashes");
check(sourceGeometry.mesh_elements === 3648 && sourceGeometry.mapped_mesh_elements === 3648, "source geometry retains all 3648 mapped elements");
check(sourceGeometry.provenance_status.includes("verified"), "source geometry provenance is verified");
check(comparisonIndex.source_integration.candidate_acceptance_status === "pending", "candidate acceptance remains pending");
check(revised.sha256 === "1448f524ce0d5c53ff3afcca7ac515024c538cfa71623282f560e98fe163e90e", "current hallway candidate IFC hash remains unchanged");
check(revised.ifc_sha256 === revised.sha256, "comparison candidate exposes its IFC hash separately");
check(revised.browser_geometry.ifc_sha256 === revised.ifc_sha256 && revised.browser_geometry.glb_sha256 === "fb0f4623c534e60404d443686fe6909200e50566061f56f8ba0889317dcaf9cd" && revised.browser_geometry.sha256 === revised.browser_geometry.glb_sha256, "candidate browser geometry uses its true GLB byte hash");
check(comparisonIndex.source_integration.source_ifc_sha256 === source.sha256 && comparisonIndex.source_integration.source_glb_sha256 === sourceGeometry.glb_sha256 && comparisonIndex.source_integration.candidate_ifc_sha256 === revised.ifc_sha256 && comparisonIndex.source_integration.candidate_glb_sha256 === revised.browser_geometry.glb_sha256, "integration manifest distinguishes both IFC and GLB hashes");
check(comparisonIndex.quarantined_legacy_source.status === "preserved_not_authoritative", "old ceiling-down generic snapshot is explicitly quarantined");
check(comparisonIndex.summary.comparison_records === 640 && comparisonIndex.summary.graph_nodes === 23, "comparison graph and change counts remain intact");

check(integration.status === "accepted_true_original_source_only", "integration manifest records source-only acceptance");
check(integration.immutable_original.ifc_sha256 === source.sha256 && integration.immutable_original.glb_sha256 === sourceGeometry.glb_sha256, "integration source record separates IFC and GLB hashes");
check(integration.current_candidate.ifc_sha256 === revised.ifc_sha256 && integration.current_candidate.glb_sha256 === revised.browser_geometry.glb_sha256, "integration candidate record separates IFC and GLB hashes");
check(integration.policy.copied_full_entity_graph === false, "full entity graph is not copied into the public bundle");
check(mapping.status === "integrated_in_viewer", "integrated source mapping is marked as integrated");
check(validation.status === "passed" && validation.counts.gltf_identity_nodes === 3648, "accepted source scene validator passes identity coverage");
check(validation.checks.browser_draco_compression === false, "source loader remains compatible with uncompressed GLB");

const sourceGlbPath = path.join(distData, "MBF5-TEST-COORDINATION.original.scene.glb");
check(sha256(sourceGlbPath) === sourceGeometry.sha256, "integrated source GLB bytes match the recorded hash");
const candidateGlbPath = path.join(distData, "MBF5-TEST-COORDINATION.hallway-coordination.scene.glb");
check(sha256(candidateGlbPath) === revised.browser_geometry.glb_sha256, "candidate GLB bytes match the recorded geometry hash");
const sourceViewerIndex = JSON.parse(fs.readFileSync(path.join(distData, "MBF5-TEST-COORDINATION.original.viewer_index.json"), "utf8"));
check(sourceViewerIndex.source_sha256 === source.sha256 && sourceViewerIndex.nodes.length === 9097, "source viewer index is compact and source-linked");
for (const forbidden of ["nodes.jsonl.gz", "edges.jsonl.gz", "semantic_edges.jsonl.gz"]) check(!fs.existsSync(path.join(distData, forbidden)), `full graph artifact is absent: ${forbidden}`);

const legacy = JSON.parse(fs.readFileSync(path.join(distData, "MBF5-TEST-COORDINATION.ceiling-down-150mm.legacy.provenance.json"), "utf8"));
for (const [name, expected] of Object.entries(legacy.files)) check(sha256(path.join(distData, name)) === expected, `legacy snapshot preserved: ${name}`);

for (const asset of [
  "/data/MBF5-TEST-COORDINATION.original.scene.glb",
  "/data/MBF5-TEST-COORDINATION.hallway-coordination.scene.glb",
  "/data/MBF5-TEST-COORDINATION.original.scene_bridge.json",
  "/data/MBF5-TEST-COORDINATION.original.scene_bridge_index.json",
  "/data/MBF5-TEST-COORDINATION.original.ifc.gz",
  "/data/MBF5-TEST-COORDINATION.original.scene.validation.json"
]) {
  const response = await head(`${baseUrl}${asset}`);
  check(Number(response.headers.get("content-length")) > 0, `${asset} is browser reachable`);
}

const stagedPage = await getText(`${stagedUrl}/`);
check(stagedPage.includes("MBF5-TEST-COORDINATION.raw.glb") && stagedPage.includes("no Draco"), "staged raw GLB compatibility page is available");

console.log(`UI remediation smoke passed ${passed} checks.`);
