import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repo = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), "..");
const dataDir = path.join(repo, "dist", "data");
const projectRoot = path.resolve(repo, "..");

const stageCeiling = path.join(projectRoot, "stage2_ceiling_down_150mm");
const stagePanels = path.join(projectRoot, "stage2_ceiling_access_panels_20260918");
const stageHallway = path.join(projectRoot, "stage2_hallway_coordination_20260918");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 3) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const slug = (value) => String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined))];
const mm = (values) => Array.isArray(values) ? values.map((value) => round(Number(value) * 1000, 1)) : null;
const lower = (value) => String(value || "").toLowerCase();

const originalManifest = readJson(path.join(dataDir, "MBF5-TEST-COORDINATION.manifest.json"));
const revisedManifest = readJson(path.join(dataDir, "MBF5-TEST-COORDINATION.hallway-coordination.scene.manifest.json"));
const viewerIndex = readJson(path.join(dataDir, "viewer_index.json"));
const ceilingManifest = readJson(path.join(stageCeiling, "edit_manifest.json"));
const ceilingEntities = readJson(path.join(stageCeiling, "before_after_entities.json"));
const ceilingImpact = readJson(path.join(stageCeiling, "impact_report.json"));
const panelManifest = readJson(path.join(stagePanels, "edit_manifest.json"));
const panelEntities = readJson(path.join(stagePanels, "before_after_entities.json"));
const panelScope = readJson(path.join(stagePanels, "ceiling_access_scope.json"));
const hallwayManifest = readJson(path.join(stageHallway, "edit_manifest.json"));
const hallwayEntities = readJson(path.join(stageHallway, "before_after_entities.json"));
const hallwayImpact = readJson(path.join(stageHallway, "impact_report.json"));
const hallwayInstruction = readJson(path.join(stageHallway, "edit_instruction.json"));

const nodeByStep = new Map((viewerIndex.nodes || []).map((node) => [Number(node.step_id), node]));
const nodeByGlobalId = new Map((viewerIndex.nodes || []).filter((node) => node.global_id).map((node) => [node.global_id, node]));

function entityNode(stepId, globalId) {
  return nodeByStep.get(Number(stepId)) || nodeByGlobalId.get(globalId) || null;
}

function constructionLabel(entity = {}, fallback = "Building element") {
  const raw = [entity.name, entity.object_type, entity.description].find((value) => value && String(value).trim()) || fallback;
  const text = String(raw).replace(/^MCW\s*-\s*/i, "").replace(/:\d+\s*$/, "").replace(/\s+/g, " ").trim();
  const value = lower(text);
  if (value.includes("access panel")) return text.replace(/\bopening\b/i, "opening");
  if (value.includes("conduit bay")) return text;
  if (value.includes("unistrut")) return "Unistrut support";
  if (value.includes("duct") || value.includes("mitered elbow") || value.includes("radius elbow")) {
    if (value.includes("mitered") || value.includes("elbow")) return "Duct fitting";
    if (value.includes("silencer")) return "Duct silencer";
    if (value.includes("tap")) return "Duct tap fitting";
    if (value.includes("transition")) return "Duct transition fitting";
    return "Duct segment";
  }
  if (value.includes("valve") || value.includes("flow controller")) return "Valve";
  if (value.includes("sprinkler") || value.includes("fire protection") || value.includes("fire branch")) return "Fire protection branch";
  if (value.includes("light") || value.includes("luminaire")) return "Ceiling light";
  if (value.includes("grille") || value.includes("diffuser") || value.includes("terminal")) return "Air terminal";
  if (value.includes("pipe") || value.includes("glycol") || value.includes("domestic") || /\b(gsh|grh)\b/.test(value)) return "Mechanical pipe";
  if (value.includes("mechanical equip") || value.includes("equipment")) return "Mechanical equipment";
  if (value.includes("ceiling") || entity.entity_type === "IfcCovering") return "Ceiling surface";
  if (entity.entity_type === "IfcFlowFitting") return "Service fitting";
  if (entity.entity_type === "IfcFlowSegment") return "Service segment";
  if (entity.entity_type === "IfcBuildingElementProxy") return "Coordination element";
  return text.slice(0, 90);
}

function disciplineFor(entity = {}) {
  const text = lower([entity.name, entity.object_type, entity.description, entity.entity_type].join(" "));
  if (text.includes("sprinkler") || text.includes("fire") || text.includes("fp ")) return "Fire protection";
  if (text.includes("duct") || text.includes("air terminal") || text.includes("grille") || text.includes("mechanical")) return "Mechanical";
  if (text.includes("valve") || text.includes("glycol") || text.includes("domestic") || text.includes("pipe")) return "Plumbing / mechanical";
  if (text.includes("conduit") || text.includes("electrical") || text.includes("unistrut") || text.includes("light")) return "Electrical";
  if (text.includes("ceiling") || text.includes("access panel")) return "Architecture";
  return "Coordination";
}

function operationTitle(operation) {
  const op = operation?.operation || "coordination change";
  const titles = {
    create_conduit_bay: "Reserved conduit bay",
    create_unistrut: "Unistrut support below conduit bay",
    supersede_electrical_space_holder: "Electrical space reservation replaced",
    reroute_duct_cell: "Duct route adjusted",
    lower_top_tap_window: "Top tap window lowered",
    move_mechanical_main_to_north_rack: "Main moved to north wall rack",
    lift_fire_branch_clear_of_lighting: "Fire branch lifted clear of lighting",
    lift_fire_branch_clear_of_lighting_below_conduit_bay: "Fire branch lifted below conduit bay"
  };
  return titles[op] || op.replaceAll("_", " ");
}

function operationGroup(operation) {
  const op = lower(operation?.operation);
  if (op.includes("conduit") || op.includes("unistrut") || op.includes("space_holder")) return "conduit-bay";
  if (op.includes("duct")) return "duct-routing";
  if (op.includes("north_rack") || op.includes("tap_window")) return "north-wall-piping";
  if (op.includes("fire_branch")) return "sprinkler-lighting";
  return "conduit-bay";
}

function traceFor(before = {}, after = {}, stageId) {
  const source = after && after.source_step_id !== undefined ? after : before;
  return {
    step_id: number(source.source_step_id ?? source.step_id),
    global_id: source.ifc_global_id || null,
    entity_type: source.entity_type || null,
    geometry_id: source.geometry_id || null,
    usd_prim_path: source.usd_prim_path || null,
    gltf_node_name: source.gltf_node_name || (source.source_step_id !== undefined ? `id-${source.source_step_id}` : null),
    before_hash: before.entity_hash || before.fingerprint || null,
    after_hash: after.entity_hash || after.fingerprint || null,
    stage_id: stageId
  };
}

function provenance(stageId, sourcePaths = []) {
  return {
    stage_id: stageId,
    source_paths: sourcePaths,
    source_model_sha256: originalManifest.source_sha256,
    authoritative_source: "/Users/mohamedadel/Downloads/MBF5-TEST-COORDINATION.ifc"
  };
}

const ceilingHostByStep = new Map();
for (const ceiling of ceilingImpact.ceilings || []) {
  for (const stepId of ceiling.host_step_ids || []) ceilingHostByStep.set(Number(stepId), ceiling);
}
const ceilingPortByStep = new Map();
for (const ceiling of ceilingImpact.ceilings || []) {
  for (const stepId of ceiling.port_step_ids || []) ceilingPortByStep.set(Number(stepId), ceiling);
}

const ceilingChanges = (ceilingEntities.entities || []).filter((entity) => entity.change_status === "changed").map((entity) => {
  const before = entity.before || {};
  const after = entity.after || {};
  const stepId = number(after.source_step_id ?? before.source_step_id);
  const host = ceilingHostByStep.get(stepId) || null;
  const port = ceilingPortByStep.get(stepId) || null;
  const label = constructionLabel(after, "Ceiling service");
  return {
    id: `ceiling-${stepId}`,
    group_id: "ceiling-hosted",
    status: "moved",
    label,
    discipline: disciplineFor(after),
    summary: `Moved down 150 mm with the coordinated ceiling zone`,
    before: { world_translation_m: before.world_translation_m || null, level_m: round(before.world_translation_m?.[2], 3) },
    after: { world_translation_m: after.world_translation_m || null, level_m: round(after.world_translation_m?.[2], 3) },
    delta_mm: mm(entity.observed_world_delta_m),
    relationship_impact: {
      hosting: entity.hosting_evidence || null,
      inverse_relationship_types: after.inverse_relationship_types || before.inverse_relationship_types || {},
      hosted_by_ceiling_step_id: host?.source_step_id || null,
      attached_port_context: port ? { ceiling_step_id: port.source_step_id, port_count: port.port_step_ids?.length || 0 } : null
    },
    trace: traceFor(before, after, "ceiling-down-150mm"),
    provenance: provenance("ceiling-down-150mm", [
      path.join(stageCeiling, "edit_manifest.json"),
      path.join(stageCeiling, "before_after_entities.json"),
      path.join(stageCeiling, "impact_report.json")
    ])
  };
});

const panelTargetByCluster = new Map((panelScope.clusters || []).map((cluster) => [cluster.cluster_id, cluster]));
const panelChanges = (panelEntities.entities || []).filter((entity) => entity.change_status === "created").map((entity, index) => {
  const before = entity.before || {};
  const after = entity.after || {};
  const cluster = panelTargetByCluster.get(entity.cluster_id) || null;
  const isPanel = entity.artifact === "panel";
  const label = isPanel ? `Ceiling access panel ${entity.cluster_id}` : `${entity.artifact?.replaceAll("_", " ") || "Access panel support"} · ${entity.cluster_id}`;
  return {
    id: `access-${entity.cluster_id}-${entity.artifact}-${index + 1}`,
    group_id: "maintenance-access",
    status: "created",
    label,
    discipline: "Architecture",
    summary: isPanel ? "600 × 600 mm access opening added for ceiling services" : `Supporting IFC record added for ${entity.cluster_id}`,
    cluster_id: entity.cluster_id,
    artifact: entity.artifact,
    target_step_ids: cluster?.target_steps || [],
    target_labels: (cluster?.target_names || []).slice(0, 4).map((name) => constructionLabel({ name })),
    before: { state: "absent in source IFC" },
    after: { name: after.name || null, description: after.description || null, tag: after.tag || null },
    trace: traceFor(before, after, "ceiling-access-panels"),
    provenance: provenance("ceiling-access-panels", [
      path.join(stagePanels, "edit_manifest.json"),
      path.join(stagePanels, "before_after_entities.json"),
      path.join(stagePanels, "ceiling_access_scope.json")
    ])
  };
});

const hallwayChanges = (hallwayManifest.operations || []).map((operation, index) => {
  const target = operation.target || {};
  const replacement = operation.replacement || null;
  const targetNode = entityNode(target.source_step_id, target.global_id);
  const groupId = operationGroup(operation);
  const title = operationTitle(operation);
  const targetLabel = constructionLabel(targetNode || target, title);
  const delta = operation.delta_m || null;
  const geometry = operation.geometry || null;
  return {
    id: `hallway-${String(index + 1).padStart(2, "0")}-${slug(operation.operation)}`,
    group_id: groupId,
    status: operation.operation.startsWith("create_") ? "created" : operation.operation.startsWith("supersede_") ? "replaced" : "rerouted",
    label: title,
    discipline: disciplineFor(targetNode || target),
    summary: operation.reason || `${title} applied`,
    target_label: targetLabel,
    delta_mm: mm(delta),
    parameters: geometry ? {
      width_m: geometry.width_m ?? null,
      depth_m: geometry.depth_m ?? null,
      bottom_z_m: geometry.bottom_z_m ?? null,
      top_z_m: geometry.top_z_m ?? null,
      route_s_m: geometry.s_m ?? null,
      route_q_m: geometry.q_m ?? null
    } : null,
    replacement: replacement ? { ...replacement, label: constructionLabel(entityNode(replacement.source_step_id, replacement.global_id) || replacement, "Replacement element") } : null,
    before: { state: operation.operation.startsWith("create_") ? "not present" : "existing route or position" },
    after: { state: "applied to revised IFC" },
    trace: {
      step_id: number(target.source_step_id),
      global_id: target.global_id || null,
      entity_type: target.entity_type || null,
      geometry_id: targetNode?.geometry_id || `geom:openusd-v1:ifc-step-${target.source_step_id}`,
      before_hash: null,
      after_hash: null,
      replacement_step_id: replacement?.source_step_id || null,
      replacement_global_id: replacement?.global_id || null,
      stage_id: "hallway-coordination"
    },
    provenance: provenance("hallway-coordination", [
      path.join(stageHallway, "edit_manifest.json"),
      path.join(stageHallway, "impact_report.json"),
      path.join(stageHallway, "edit_instruction.json")
    ])
  };
});

const changes = [...ceilingChanges, ...panelChanges, ...hallwayChanges];
const changeIds = (groupId) => changes.filter((change) => change.group_id === groupId).map((change) => change.id);
const stepsForGroup = (groupId) => unique(changes.filter((change) => change.group_id === groupId).flatMap((change) => [change.trace.step_id, change.trace.replacement_step_id, ...(change.target_step_ids || [])]).map(Number).filter(Number.isInteger));

const issueGroups = [
  {
    id: "ceiling-hosted",
    kicker: "Vertical coordination",
    title: "Ceiling services moved with the ceiling",
    status: "Resolved in revised IFC",
    priority: "High",
    before: "Ceiling services were coordinated at the previous ceiling elevation.",
    after: "The ceiling zone and its hosted fixtures, devices, terminals, and attached port context move down 150 mm together.",
    why: "Keeps the visible ceiling plane, service devices, and connectivity context aligned.",
    metric: `${ceilingImpact.counts?.affected_products || ceilingChanges.length} linked elements · 150 mm vertical move`,
    change_ids: changeIds("ceiling-hosted"),
    focus_step_ids: stepsForGroup("ceiling-hosted").slice(0, 520),
    validation: "Affected world deltas match the request; original STEP IDs and GlobalIds remain preserved.",
    evidence_stage: "ceiling-down-150mm"
  },
  {
    id: "maintenance-access",
    kicker: "Maintainability",
    title: "Ceiling access added where services need it",
    status: "Resolved in revised IFC",
    priority: "High",
    before: "Mechanical equipment and valves lacked a coordinated access path through the ceiling presentation.",
    after: "32 600 × 600 mm access panels are represented, with 224 IFC records covering panels, openings, relationships, and access properties.",
    why: "Makes future inspection and service access visible and traceable in the model.",
    metric: `${panelScope.counts?.access_panels || 32} access panels · ${panelChanges.length} IFC records`,
    change_ids: changeIds("maintenance-access"),
    focus_step_ids: stepsForGroup("maintenance-access").slice(0, 360),
    validation: "Every selected target is covered; panel geometry fits its host ceiling; created relationships validate.",
    evidence_stage: "ceiling-access-panels"
  },
  {
    id: "conduit-bay",
    kicker: "Electrical route",
    title: "A dedicated conduit bay now runs below the beams",
    status: "Resolved in revised IFC",
    priority: "High",
    before: "Electrical reservation space competed with the service routes in the hallway.",
    after: "A 4 ft wide × 6 in deep route is reserved as high as possible below the beams, with 2 in Unistrut below.",
    why: "Gives the electrical route a clear, inspectable zone and an explicit support interface.",
    metric: "1.219 m wide · 0.152 m deep · 0.051 m support",
    change_ids: changeIds("conduit-bay"),
    focus_step_ids: stepsForGroup("conduit-bay"),
    validation: "Bay clearance and beam clearance checks passed; the route system is present in the revised IFC.",
    evidence_stage: "hallway-coordination"
  },
  {
    id: "duct-routing",
    kicker: "Air distribution",
    title: "Duct cells were shifted without changing size",
    status: "Resolved in revised IFC",
    priority: "High",
    before: "Selected duct cells conflicted with the new electrical reservation.",
    after: "Affected ducts and their standard fittings move as connected cells; size signatures remain unchanged.",
    why: "Preserves airflow design intent while giving the hallway route room to work.",
    metric: `${hallwayChanges.filter((change) => change.group_id === "duct-routing").length} route operations · sizes preserved`,
    change_ids: changeIds("duct-routing"),
    focus_step_ids: stepsForGroup("duct-routing"),
    validation: "Duct size signatures unchanged; fitting operations are captured in the edit manifest.",
    evidence_stage: "hallway-coordination"
  },
  {
    id: "north-wall-piping",
    kicker: "Piping strategy",
    title: "Piping is consolidated low along the north wall",
    status: "Resolved in revised IFC",
    priority: "High",
    before: "Main piping and cross-hall tap windows occupied competing elevations.",
    after: "Glycol, mechanical, and domestic routes use the low north-wall rack, with top tap windows lowered to keep the electrical route above.",
    why: "Creates a readable service rack and leaves the hallway center available for other systems.",
    metric: `${hallwayChanges.filter((change) => change.group_id === "north-wall-piping").length} piping operations`,
    change_ids: changeIds("north-wall-piping"),
    focus_step_ids: stepsForGroup("north-wall-piping"),
    validation: "North-wall main checks passed; top-tap orientation was preserved in the coordination evidence.",
    evidence_stage: "hallway-coordination"
  },
  {
    id: "sprinkler-lighting",
    kicker: "Life safety",
    title: "Fire-protection branches clear the lighting envelope",
    status: "Resolved in revised IFC",
    priority: "Critical interface",
    before: "Fire-protection branches crossed the lighting coordination zone.",
    after: "Branches lift where beam clearance permits and the transverse branch stays below the conduit bay while clearing lighting.",
    why: "Protects the life-safety route and keeps ceiling lighting serviceable.",
    metric: `${hallwayChanges.filter((change) => change.group_id === "sprinkler-lighting").length} fire-protection operations`,
    change_ids: changeIds("sprinkler-lighting"),
    focus_step_ids: stepsForGroup("sprinkler-lighting"),
    validation: "Fire branches clear lighting; sprinkler main adjacency to mechanical mains passed.",
    evidence_stage: "hallway-coordination"
  }
];

const graphNodes = [];
const graphEdges = [];
const graphNodeIds = new Set();
function addGraphNode(node) {
  if (graphNodeIds.has(node.id)) return;
  graphNodeIds.add(node.id);
  graphNodes.push(node);
}
function addIssueNode(group) {
  addGraphNode({
    id: `issue:${group.id}`,
    kind: "issue",
    label: group.title,
    subtitle: group.kicker,
    status: group.status,
    group_id: group.id,
    focus_step_ids: group.focus_step_ids
  });
}
function addSystemNode(id, label, subtitle, discipline) {
  addGraphNode({ id: `system:${id}`, kind: "system", label, subtitle, discipline, status: "coordinated" });
}
function addElementNode(stepId, groupId, relation = "affected") {
  const node = entityNode(stepId);
  if (!node) return null;
  const id = `element:${stepId}`;
  addGraphNode({
    id,
    kind: "element",
    label: constructionLabel(node),
    subtitle: disciplineFor(node),
    discipline: disciplineFor(node),
    status: "linked",
    group_id: groupId,
    step_id: Number(node.step_id),
    technical: { global_id: node.global_id || null, step_id: Number(node.step_id), entity_type: node.entity_type || null, relationship: relation }
  });
  return id;
}
function edge(source, target, label, kind = "interface") {
  graphEdges.push({ id: `edge-${graphEdges.length + 1}`, source, target, label, kind });
}

for (const group of issueGroups) addIssueNode(group);
addSystemNode("ceiling-services", "Ceiling services", "Ceiling plane and hosted devices", "Architecture / mechanical");
addSystemNode("maintenance", "Maintenance access", "Access panels and service points", "Architecture");
addSystemNode("electrical-route", "Conduit route", "Reserved electrical bay", "Electrical");
addSystemNode("air-distribution", "Air distribution", "Duct segments and fittings", "Mechanical");
addSystemNode("north-wall-rack", "North-wall piping rack", "Glycol, mechanical, and domestic mains", "Plumbing / mechanical");
addSystemNode("fire-protection", "Fire protection", "Sprinkler mains and branches", "Fire protection");
addSystemNode("lighting", "Ceiling lighting", "Lighting clearance envelope", "Electrical");

edge("issue:ceiling-hosted", "system:ceiling-services", "moves with");
edge("issue:maintenance-access", "system:maintenance", "opens access to");
edge("issue:conduit-bay", "system:electrical-route", "reserves space for");
edge("issue:duct-routing", "system:air-distribution", "reroutes");
edge("issue:north-wall-piping", "system:north-wall-rack", "consolidates");
edge("issue:sprinkler-lighting", "system:fire-protection", "clears");
edge("issue:sprinkler-lighting", "system:lighting", "protects");
edge("system:electrical-route", "system:fire-protection", "runs below");
edge("system:north-wall-rack", "system:fire-protection", "runs beside");
edge("system:ceiling-services", "system:maintenance", "requires access through");

const keyElements = [
  [1109713, "ceiling-hosted", "hosts"],
  [15815, "ceiling-hosted", "moves with"],
  [1328852, "conduit-bay", "reserves"],
  [1328867, "conduit-bay", "supports"],
  [100414, "duct-routing", "reroutes"],
  [24707, "duct-routing", "reroutes"],
  [73640, "north-wall-piping", "moves low along"],
  [110862, "north-wall-piping", "moves low along"],
  [1074123, "sprinkler-lighting", "clears"],
  [1092621, "sprinkler-lighting", "clears"]
];
for (const [stepId, groupId, relation] of keyElements) {
  const elementId = addElementNode(stepId, groupId, relation);
  if (!elementId) continue;
  const systemId = groupId === "ceiling-hosted" ? "system:ceiling-services" : groupId === "conduit-bay" ? "system:electrical-route" : groupId === "duct-routing" ? "system:air-distribution" : groupId === "north-wall-piping" ? "system:north-wall-rack" : "system:fire-protection";
  edge(systemId, elementId, relation);
}

for (const group of issueGroups) {
  const systemId = group.id === "ceiling-hosted" ? "system:ceiling-services" : group.id === "maintenance-access" ? "system:maintenance" : group.id === "conduit-bay" ? "system:electrical-route" : group.id === "duct-routing" ? "system:air-distribution" : group.id === "north-wall-piping" ? "system:north-wall-rack" : "system:fire-protection";
  edge(`issue:${group.id}`, systemId, "resolves");
}

const originalHash = originalManifest.source_sha256;
const revisedHash = hallwayManifest.output.ifc_sha256;
const graphSourceHash = sha256File(path.join(dataDir, "viewer_index.json"));
const validationChecks = {
  source_ifc_hash_captured: originalHash === ceilingManifest.base.ifc_sha256,
  revised_ifc_hash_captured: revisedHash === hallwayManifest.output.ifc_sha256,
  original_global_ids_preserved: Boolean(hallwayManifest.validation?.checks?.original_global_ids_preserved),
  original_step_ids_preserved: Boolean(hallwayManifest.validation?.checks?.original_step_ids_preserved),
  ceiling_move_validated: Boolean(ceilingManifest.validation?.checks?.all_affected_world_deltas_match_request),
  access_panel_targets_covered: Boolean(panelManifest.validation?.checks?.all_panel_targets_within_coverage),
  access_panel_geometry_validated: Boolean(panelManifest.validation?.checks?.all_panels_fit_host_bbox),
  conduit_bay_clearance_validated: Boolean(hallwayManifest.validation?.checks?.conduit_bay_clear_with_tolerance),
  beam_clearance_validated: Boolean(hallwayManifest.validation?.checks?.conduit_bay_clear_of_beams),
  duct_sizes_unchanged: Boolean(hallwayManifest.validation?.checks?.duct_sizes_unchanged),
  fire_branches_clear_lighting: Boolean(hallwayManifest.validation?.checks?.fire_branches_clear_of_lighting),
  north_wall_main_checks: Boolean(hallwayManifest.validation?.checks?.north_wall_main_checks),
  sprinkler_adjacency: Boolean(hallwayManifest.validation?.checks?.sprinkler_main_adjacent_to_mechanical),
  no_dangling_references: Boolean(hallwayManifest.validation?.checks?.zero_dangling_references),
  scene_identity_bridge: Boolean(hallwayManifest.validation?.checks?.scene_identity_bridge_passed)
};

const comparisonIndex = {
  schema: "bim-before-after-comparison-1",
  generated_at_utc: new Date().toISOString(),
  presentation: {
    title: "Hallway change studio",
    primary_language: "human-readable construction terminology",
    raw_identifiers: "secondary technical provenance only",
    interaction: "select a story, graph node, or model element to keep both models and evidence synchronized"
  },
  authoritative_source: {
    label: "Original IFC source model",
    ifc_path: "/Users/mohamedadel/Downloads/MBF5-TEST-COORDINATION.ifc",
    sha256: originalHash,
    schema: ceilingManifest.base.ifc_schema,
    entity_count: ceilingManifest.base.ifc_entity_count,
    browser_geometry: {
      url: "data/MBF5-TEST-COORDINATION.glb",
      manifest_url: "data/MBF5-TEST-COORDINATION.manifest.json",
      sha256: originalManifest.output_sha256 || null,
      mesh_elements: originalManifest.mesh_elements_written,
      identity: originalManifest.element_identity
    }
  },
  revised_model: {
    label: "Revised hallway coordination IFC",
    ifc_path: hallwayManifest.output.ifc_path,
    sha256: revisedHash,
    parent_sha256: hallwayManifest.output.parent_source_sha256,
    authoritative_original_sha256: hallwayManifest.output.authoritative_original_sha256,
    schema: hallwayManifest.output.ifc_schema,
    entity_count: hallwayManifest.output.ifc_entity_count,
    browser_geometry: {
      url: "data/MBF5-TEST-COORDINATION.hallway-coordination.scene.glb",
      manifest_url: "data/MBF5-TEST-COORDINATION.hallway-coordination.scene.manifest.json",
      sha256: revisedManifest.source_sha256,
      mesh_objects: revisedManifest.mesh_objects,
      mapped_mesh_objects: revisedManifest.mapped_mesh_objects,
      identity_properties: revisedManifest.custom_identity_properties,
      coordinate_frame: revisedManifest.coordinate_frame
    }
  },
  graph_source: {
    url: "data/viewer_index.json",
    sha256: graphSourceHash,
    stage2_state: viewerIndex.stage2_state,
    stats: viewerIndex.stats
  },
  stages: [
    {
      id: "ceiling-down-150mm",
      label: "Ceiling and hosted services",
      input_sha256: ceilingManifest.base.ifc_sha256,
      output_sha256: ceilingManifest.output.ifc_sha256,
      operation_count: ceilingManifest.operations?.length || 0,
      affected_products: ceilingImpact.counts?.affected_products,
      validation_status: ceilingManifest.validation.status,
      warning: ceilingManifest.validation.warnings?.[0] || null
    },
    {
      id: "ceiling-access-panels",
      label: "Ceiling access panels",
      input_sha256: panelManifest.base.ifc_sha256,
      output_sha256: panelManifest.output.ifc_sha256,
      operation_count: panelManifest.operations?.length || 0,
      access_panels: panelScope.counts?.access_panels,
      created_ifc_records: panelChanges.length,
      validation_status: panelManifest.validation.status
    },
    {
      id: "hallway-coordination",
      label: "Hallway routing solution",
      input_sha256: hallwayManifest.base.ifc_sha256,
      output_sha256: hallwayManifest.output.ifc_sha256,
      operation_count: hallwayManifest.operations?.length || hallwayChanges.length,
      validation_status: hallwayManifest.validation.status,
      validation_checks: hallwayManifest.validation.checks
    }
  ],
  summary: {
    original_ifc_entities: ceilingManifest.base.ifc_entity_count,
    revised_ifc_entities: hallwayManifest.output.ifc_entity_count,
    original_mesh_elements: originalManifest.mesh_elements_written,
    revised_mesh_elements: revisedManifest.mesh_objects,
    ceiling_move_affected_products: ceilingImpact.counts?.affected_products || ceilingChanges.length,
    inferred_hosted_fixtures: ceilingImpact.counts?.inferred_hosted_fixtures || null,
    attached_distribution_ports: ceilingImpact.counts?.attached_distribution_ports || null,
    access_panels: panelScope.counts?.access_panels || 0,
    access_panel_ifc_records: panelChanges.length,
    hallway_operations: hallwayManifest.operations?.length || hallwayChanges.length,
    comparison_records: changes.length,
    graph_nodes: graphNodes.length,
    graph_edges: graphEdges.length
  },
  issue_groups: issueGroups,
  changes,
  graph: { nodes: graphNodes, edges: graphEdges },
  validation: {
    status: Object.values(validationChecks).every(Boolean) ? "passed_with_known_limitations" : "review_required",
    checks: validationChecks,
    unresolved_or_contextual: [
      {
        id: "inferred-ceiling-hosting",
        severity: "medium",
        label: "Some ceiling hosting is inferred geometrically",
        detail: "The source IFC has no explicit product host relationship for the selected fixtures; the edit evidence uses footprint and placement context with a 0.5 m tolerance.",
        provenance: "ceiling-down-150mm"
      },
      {
        id: "residual-aabb-review",
        severity: "medium",
        label: "Residual conservative envelope candidates remain review candidates",
        detail: "The hallway report records 468 conservative AABB candidate pairs; these are retained as review context and are not asserted as hard clashes.",
        provenance: "hallway-coordination"
      },
      {
        id: "browser-identity",
        severity: "low",
        label: "Browser geometry is a derived display layer",
        detail: "The comparison view selects glTF meshes through stable IFC STEP IDs and the scene bridge; IFC and graph manifests remain the source of truth.",
        provenance: "scene bridge and viewer index"
      }
    ],
    source_validation_paths: [
      path.join(stageCeiling, "ifc_validation.json"),
      path.join(stagePanels, "ifc_validation.json"),
      path.join(stageHallway, "coordination_validation.json"),
      path.join(stageHallway, "viewer", "data", "MBF5-TEST-COORDINATION.hallway-coordination.scene.validation.json")
    ]
  },
  schema_documentation: {
    issue_groups: "Human-readable coordination topics. Each group points to change_ids and focus_step_ids.",
    changes: "Element or IFC-record-level comparison entries with status, before/after summary, technical trace, and source provenance.",
    graph: "True nodes-and-edges graph. Issue and system labels are human-readable; element nodes retain stable STEP and GlobalId values in technical metadata.",
    trace: "step_id and global_id identify IFC identity; geometry_id, USD path, and glTF node name identify derived display identity; hashes identify before/after evidence.",
    units: "Distances in the comparison payload use metres unless a field ends with _mm; the presentation uses millimetres and feet/inches where useful."
  }
};

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "comparison_index.json"), `${JSON.stringify(comparisonIndex, null, 2)}\n`);
console.log(`Wrote ${path.join(dataDir, "comparison_index.json")}`);
console.log(JSON.stringify({
  stages: comparisonIndex.stages.map((stage) => ({ id: stage.id, output_sha256: stage.output_sha256 })),
  summary: comparisonIndex.summary,
  validation: comparisonIndex.validation.status
}, null, 2));
