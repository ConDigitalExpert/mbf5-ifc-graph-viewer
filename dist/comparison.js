const DATA_URL = "./data/comparison_index.json?v=20260918-change2";

const els = {
  status: document.querySelector("#comparison-status"),
  workspace: document.querySelector("#comparison-workspace"),
  storyDock: document.querySelector("#story-dock"),
  graphDock: document.querySelector("#graph-dock"),
  technicalDrawer: document.querySelector("#technical-drawer"),
  storySummary: document.querySelector("#story-summary"),
  storyList: document.querySelector("#story-list"),
  storyDetail: document.querySelector("#story-detail"),
  graph: document.querySelector("#comparison-graph"),
  graphSelection: document.querySelector("#graph-selection"),
  technicalContent: document.querySelector("#technical-content"),
  beforeLoading: document.querySelector("#before-loading"),
  afterLoading: document.querySelector("#after-loading"),
  beforePicked: document.querySelector("#before-picked"),
  afterPicked: document.querySelector("#after-picked"),
  footerMetrics: document.querySelector("#footer-metrics"),
  timelineProgress: document.querySelector("#timeline-progress"),
  opacity: document.querySelector("#overlay-opacity"),
  opacityValue: document.querySelector("#overlay-opacity-value"),
  syncCameras: document.querySelector("#sync-cameras"),
  toast: document.querySelector("#comparison-toast")
};

const state = {
  index: null,
  groups: [],
  groupById: new Map(),
  changeById: new Map(),
  changesByStep: new Map(),
  graphNodeById: new Map(),
  selectedGroupId: null,
  selectedChangeId: null,
  selectedGraphNodeId: null,
  mode: "split",
  beforeOpacity: .48,
  syncCameras: true,
  cameraDriver: "after",
  playTimer: null,
  playIndex: 0,
  sides: { before: null, after: null }
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const formatNumber = (value) => new Intl.NumberFormat("en-CA").format(Number(value || 0));
const formatMeters = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(3)} m` : "—";
const formatDelta = (values) => Array.isArray(values) ? values.map((value) => `${Number(value).toFixed(1)} mm`).join(" · ") : "—";
const truncate = (value, length = 24) => { const text = String(value || ""); return text.length > length ? `${text.slice(0, length - 1)}…` : text; };

function setStatus(message, status = "") {
  els.status.className = `load-status ${status}`;
  els.status.innerHTML = `<i></i>${esc(message)}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("visible"), 2300);
}

function splitAssetUrl(url) {
  const clean = String(url || "").split("?")[0];
  const slash = clean.lastIndexOf("/");
  return { root: slash >= 0 ? clean.slice(0, slash + 1) : "./", file: clean.slice(slash + 1) };
}

function parseStep(mesh) {
  let current = mesh;
  while (current) {
    const metadataStep = Number(current.metadata?.ifc_step_id ?? current.metadata?.source_step_id);
    if (Number.isInteger(metadataStep)) return metadataStep;
    const match = String(current.name || "").match(/(?:^|[_-])id[_-]?(\d+)(?:$|[_-])/i);
    if (match) return Number(match[1]);
    current = current.parent;
  }
  return null;
}

function boundsForMeshes(meshes) {
  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;
  for (const mesh of meshes) {
    if (!mesh.getBoundingInfo || mesh.getTotalVertices?.() === 0) continue;
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
    count += 1;
  }
  if (!count) throw new Error("No renderable comparison meshes were found");
  return { min, max, center: min.add(max).scale(.5), size: max.subtract(min) };
}

function cameraPlan(side, mode = "perspective") {
  const bounds = side.modelBounds;
  const maxDim = Math.max(bounds.size.x, bounds.size.y, bounds.size.z, 1);
  const plan = { alpha: -Math.PI / 2.35, beta: Math.PI / 2.95, radius: maxDim * 1.5, target: bounds.center.clone() };
  if (mode === "top") { plan.alpha = -Math.PI / 2; plan.beta = .08; plan.radius = maxDim * 1.65; }
  if (mode === "front") { plan.alpha = -Math.PI / 2; plan.beta = Math.PI / 2; plan.radius = maxDim * 1.55; }
  if (mode === "right") { plan.alpha = 0; plan.beta = Math.PI / 2; plan.radius = maxDim * 1.55; }
  return plan;
}

function shortestAngleDelta(from, to) { return ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI; }

function animateCamera(side, plan, duration = 520) {
  if (!side?.camera) return;
  if (side.transition) side.scene.onBeforeRenderObservable.remove(side.transition);
  const camera = side.camera;
  const start = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() };
  const alphaDelta = shortestAngleDelta(start.alpha, plan.alpha);
  if (!duration) { camera.alpha = plan.alpha; camera.beta = plan.beta; camera.radius = plan.radius; camera.target.copyFrom(plan.target); side.transition = null; return; }
  const started = performance.now();
  side.transition = side.scene.onBeforeRenderObservable.add(() => {
    const raw = Math.min(1, (performance.now() - started) / duration);
    const eased = 1 - Math.pow(1 - raw, 3);
    camera.alpha = start.alpha + alphaDelta * eased;
    camera.beta = start.beta + (plan.beta - start.beta) * eased;
    camera.radius = start.radius + (plan.radius - start.radius) * eased;
    camera.target.copyFrom(BABYLON.Vector3.Lerp(start.target, plan.target, eased));
    if (raw >= 1) { side.scene.onBeforeRenderObservable.remove(side.transition); side.transition = null; }
  });
}

function copyCamera(from, to) {
  if (!state.syncCameras || !from?.camera || !to?.camera) return;
  to.camera.alpha = from.camera.alpha;
  to.camera.beta = from.camera.beta;
  to.camera.radius = from.camera.radius;
  to.camera.target.copyFrom(from.camera.target);
}

function createSide(sideName, url, canvas, loading, color) {
  const engine = new BABYLON.Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: false });
  engine.setHardwareScalingLevel(Math.max(1.1, Math.min(1.45, window.devicePixelRatio || 1)));
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(.025, .055, .067, 1);
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.08;
  scene.imageProcessingConfiguration.contrast = 1.12;
  const camera = new BABYLON.ArcRotateCamera(`comparison-${sideName}-camera`, -Math.PI / 2.35, Math.PI / 2.95, 50, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.panningSensibility = 75;
  camera.panningInertia = .88;
  camera.inertia = .9;
  camera.wheelDeltaPercentage = .009;
  camera.wheelPrecision = 25;
  camera.lowerBetaLimit = .035;
  camera.upperBetaLimit = Math.PI - .035;
  camera.lowerRadiusLimit = .04;
  camera.upperRadiusLimit = 100000;
  camera.panningMouseButton = 1;
  camera.useCtrlForPanning = false;
  camera.minZ = .01;
  camera.maxZ = 100000;
  const hemi = new BABYLON.HemisphericLight(`comparison-${sideName}-fill`, new BABYLON.Vector3(.15, 1, .25), scene);
  hemi.intensity = 1.35;
  hemi.diffuse = new BABYLON.Color3(.84, .92, 1);
  hemi.groundColor = new BABYLON.Color3(.06, .13, .16);
  const key = new BABYLON.DirectionalLight(`comparison-${sideName}-key`, new BABYLON.Vector3(-.45, -1, .55), scene);
  key.position = new BABYLON.Vector3(160, 220, 100);
  key.intensity = 1.8;
  const rim = new BABYLON.DirectionalLight(`comparison-${sideName}-rim`, new BABYLON.Vector3(.55, -.35, -.75), scene);
  rim.position = new BABYLON.Vector3(-120, 120, -180);
  rim.diffuse = color;
  rim.intensity = .72;
  const pipeline = new BABYLON.DefaultRenderingPipeline(`comparison-${sideName}-pipeline`, true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.samples = 1;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = .13;
  pipeline.bloomEnabled = false;
  const side = { name: sideName, canvas, loading, engine, scene, camera, modelRoot: null, meshes: [], meshByStep: new Map(), modelBounds: null, highlight: BABYLON.HighlightLayer ? new BABYLON.HighlightLayer(`comparison-${sideName}-highlight`, scene) : null, color, transition: null, resizeObserver: null };
  if (side.highlight) side.highlight.innerGlow = false;
  canvas.addEventListener("pointerdown", () => { state.cameraDriver = sideName; });
  const resize = () => engine.resize();
  side.resizeObserver = new ResizeObserver(resize);
  side.resizeObserver.observe(canvas.parentElement);
  engine.runRenderLoop(() => scene.render());
  return side;
}

async function loadSide(side, url) {
  const { root, file } = splitAssetUrl(url);
  const result = await BABYLON.SceneLoader.ImportMeshAsync(null, root, file, side.scene);
  side.meshes = result.meshes.filter((mesh) => mesh.getTotalVertices?.() > 0);
  side.modelRoot = new BABYLON.TransformNode(`comparison-${side.name}-root`, side.scene);
  side.meshes.forEach((mesh) => { if (!mesh.parent) mesh.parent = side.modelRoot; });
  const rawBounds = boundsForMeshes(side.meshes);
  side.modelRoot.position = rawBounds.center.scale(-1);
  side.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
  side.modelBounds = boundsForMeshes(side.meshes);
  for (const mesh of side.meshes) {
    const stepId = parseStep(mesh);
    if (!Number.isInteger(stepId)) continue;
    mesh.metadata = { ...(mesh.metadata || {}), comparisonStep: stepId };
    mesh.isPickable = true;
    if (!side.meshByStep.has(stepId)) side.meshByStep.set(stepId, []);
    side.meshByStep.get(stepId).push(mesh);
  }
  side.camera.lowerRadiusLimit = Math.max(side.modelBounds.size.length() * .004, .04);
  side.camera.upperRadiusLimit = Math.max(side.modelBounds.size.length() * 35, 1000);
  side.camera.maxZ = Math.max(side.modelBounds.size.length() * 40, 1000);
  animateCamera(side, cameraPlan(side), 0);
  side.loading.classList.add("ready");
  return side;
}

function buildChangeMaps() {
  state.groups = state.index.issue_groups || [];
  state.groupById = new Map(state.groups.map((group) => [group.id, group]));
  state.changeById = new Map((state.index.changes || []).map((change) => [change.id, change]));
  state.changesByStep = new Map();
  for (const change of state.index.changes || []) {
    const steps = [change.trace?.step_id, change.trace?.replacement_step_id, ...(change.target_step_ids || [])].map(Number).filter(Number.isInteger);
    for (const step of steps) {
      if (!state.changesByStep.has(step)) state.changesByStep.set(step, []);
      state.changesByStep.get(step).push(change.id);
    }
  }
  state.graphNodeById = new Map((state.index.graph?.nodes || []).map((node) => [node.id, node]));
}

function renderSummary() {
  const summary = state.index.summary || {};
  els.storySummary.innerHTML = [
    ["Elements", formatNumber(summary.ceiling_move_affected_products), "moved with ceiling"],
    ["Access", formatNumber(summary.access_panels), "ceiling panels"],
    ["Routes", formatNumber(summary.hallway_operations), "hallway operations"]
  ].map(([label, value, note]) => `<div class="summary-tile"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join("");
  els.footerMetrics.textContent = `${formatNumber(summary.original_ifc_entities)} source entities · ${formatNumber(summary.revised_ifc_entities)} revised entities · ${formatNumber(summary.graph_nodes)} graph nodes`;
}

function renderStoryList() {
  els.storyList.innerHTML = state.groups.map((group) => `<button class="story-card${group.id === state.selectedGroupId ? " active" : ""}" type="button" data-group="${esc(group.id)}"><span class="story-card-top"><span class="story-card-kicker">${esc(group.kicker)}</span><span class="story-card-status">${esc(group.status)}</span></span><h3>${esc(group.title)}</h3><p>${esc(group.after)}</p><span class="story-card-metric">${esc(group.metric)}</span></button>`).join("");
}

function detailTextForChange(change) {
  if (!change) return null;
  if (change.group_id === "ceiling-hosted") return `Lowered ${formatDelta(change.delta_mm)} vertically with the coordinated ceiling zone.`;
  if (change.group_id === "maintenance-access") return change.artifact === "panel" ? "Added a 600 × 600 mm ceiling access panel." : `Added the ${String(change.artifact || "supporting").replaceAll("_", " ")} record that makes the access panel traceable.`;
  return change.summary || "Coordinated route update applied.";
}

function renderGroupDetail(group) {
  if (!group) return;
  const changeCount = group.change_ids?.length || 0;
  const sampleIds = (group.change_ids || []).slice(0, 3);
  els.storyDetail.innerHTML = `<div class="detail-kicker">${esc(group.kicker)}</div><h3>${esc(group.title)}</h3><span class="detail-status">${esc(group.status)}</span><p>${esc(group.why)}</p><div class="before-after"><div class="story-side before"><span>Before</span><strong>${esc(group.before)}</strong></div><div class="story-side after"><span>After</span><strong>${esc(group.after)}</strong></div></div><div class="detail-block"><div class="detail-block-label">Evidence in this view</div><div class="detail-chip-row"><span class="detail-chip accent">${esc(group.metric)}</span><span class="detail-chip">${formatNumber(changeCount)} linked records</span><span class="detail-chip">${esc(group.evidence_stage)}</span></div></div><div class="detail-block"><div class="detail-block-label">Validation</div><div class="detail-validation">${esc(group.validation)}</div></div><div class="detail-block"><div class="detail-block-label">Choose an element</div><div class="detail-chip-row">${sampleIds.map((id) => `<button type="button" class="detail-chip" data-change="${esc(id)}">Inspect linked element</button>`).join("")}</div></div>`;
}

function renderChangeDetail(change) {
  if (!change) return;
  const group = state.groupById.get(change.group_id);
  const delta = change.delta_mm ? `<span class="detail-chip accent">${esc(formatDelta(change.delta_mm))}</span>` : "";
  const targetLabels = (change.target_labels || []).slice(0, 3).map((label) => `<span class="detail-chip">${esc(label)}</span>`).join("");
  const parameterChips = change.parameters ? Object.entries(change.parameters).filter(([, value]) => value !== null && value !== undefined).slice(0, 4).map(([key, value]) => `<span class="detail-chip">${esc(key.replaceAll("_", " "))}: ${esc(Array.isArray(value) ? value.map((item) => Number(item).toFixed(2)).join(" / ") : typeof value === "number" ? value.toFixed(3) : value)}</span>`).join("") : "";
  const before = change.before?.level_m !== undefined ? `Elevation ${formatMeters(change.before.level_m)}` : change.before?.state || "Source state";
  const after = change.after?.level_m !== undefined ? `Elevation ${formatMeters(change.after.level_m)}` : change.after?.name || change.after?.state || "Revised state";
  els.storyDetail.innerHTML = `<div class="detail-kicker">${esc(group?.kicker || "Linked change")}</div><h3>${esc(change.label)}</h3><span class="detail-status">${esc(change.status)} · ${esc(change.discipline || "Coordination")}</span><p>${esc(detailTextForChange(change))}</p><div class="before-after"><div class="story-side before"><span>Original</span><strong>${esc(before)}</strong></div><div class="story-side after"><span>Revised</span><strong>${esc(after)}</strong></div></div><div class="detail-block"><div class="detail-block-label">What this connects</div><div class="detail-chip-row">${delta}${targetLabels}${parameterChips}<span class="detail-chip">${esc(change.trace?.entity_type || "Model element")}</span></div></div><div class="detail-block"><div class="detail-block-label">Why it matters</div><div class="detail-validation">${esc(group?.why || group?.validation || "This element remains linked to its source evidence.")}</div></div><div class="detail-block"><button type="button" class="control-button" data-action="toggle-technical">Show stable element identity</button></div>`;
}

function renderTechnical(change) {
  if (!change) {
    els.technicalContent.innerHTML = `<p>Select a change to inspect its stable IFC identity, hashes, scene identity, and source evidence.</p>`;
    return;
  }
  const trace = change.trace || {};
  const rows = [
    ["STEP ID", trace.step_id],
    ["IFC GlobalId", trace.global_id],
    ["Entity class", trace.entity_type],
    ["Geometry ID", trace.geometry_id],
    ["glTF node", trace.gltf_node_name],
    ["Before hash", trace.before_hash],
    ["After hash", trace.after_hash],
    ["Replacement STEP", trace.replacement_step_id]
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const sourcePaths = (change.provenance?.source_paths || []).map((source) => `<code>${esc(source)}</code>`).join("<br />");
  els.technicalContent.innerHTML = `<div class="technical-section"><div class="technical-label">Selected change</div>${rows.map(([label, value]) => `<div class="technical-row"><span>${esc(label)}</span><code>${esc(value)}</code></div>`).join("")}</div><div class="technical-section"><div class="technical-label">Comparison data</div><div class="technical-row"><span>Stage</span><code>${esc(change.provenance?.stage_id || "—")}</code></div><div class="technical-row"><span>Status</span><code>${esc(change.status)}</code></div><div class="technical-row"><span>Group</span><code>${esc(change.group_id)}</code></div></div><div class="technical-section"><div class="technical-label">Source provenance</div><div class="technical-source">${sourcePaths || "Embedded in the comparison manifest."}</div></div>`;
}

function graphLayout() {
  const nodes = state.index.graph?.nodes || [];
  const issue = nodes.filter((node) => node.kind === "issue");
  const systems = nodes.filter((node) => node.kind === "system");
  const elements = nodes.filter((node) => node.kind === "element");
  const positions = new Map();
  const place = (list, x, spacing, yStart = 34) => list.forEach((node, index) => positions.set(node.id, { x, y: yStart + index * spacing }));
  place(issue, 92, 88, 48);
  place(systems, 260, 67, 44);
  place(elements, 431, Math.max(46, Math.min(56, 520 / Math.max(elements.length, 1))), 34);
  return positions;
}

function renderGraph() {
  const nodes = state.index.graph?.nodes || [];
  const edges = state.index.graph?.edges || [];
  const positions = graphLayout();
  const edgeMarkup = edges.map((edge) => {
    const from = positions.get(edge.source); const to = positions.get(edge.target);
    if (!from || !to) return "";
    const bend = Math.max(15, Math.abs(to.x - from.x) * .38);
    const active = state.selectedGraphNodeId && (edge.source === state.selectedGraphNodeId || edge.target === state.selectedGraphNodeId);
    return `<path class="graph-edge${active ? " active" : ""}" d="M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}" /><text class="graph-edge-label" x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 3}" text-anchor="middle">${esc(truncate(edge.label, 18))}</text>`;
  }).join("");
  const nodeMarkup = nodes.map((node) => {
    const pos = positions.get(node.id); if (!pos) return "";
    const active = node.id === state.selectedGraphNodeId || node.group_id === state.selectedGroupId;
    const label = truncate(node.label, node.kind === "element" ? 21 : 23);
    const subtitle = truncate(node.subtitle || node.discipline || "", 25);
    if (node.kind === "element") return `<g class="graph-node element${active ? " active" : ""}" data-node-id="${esc(node.id)}"><circle cx="${pos.x}" cy="${pos.y}" r="13" /><text class="graph-node-label" x="${pos.x}" y="${pos.y + 27}" text-anchor="middle">${esc(label)}</text><text class="graph-node-subtitle" x="${pos.x}" y="${pos.y + 38}" text-anchor="middle">${esc(subtitle)}</text><title>${esc(node.label)}</title></g>`;
    const width = node.kind === "issue" ? 150 : 142;
    return `<g class="graph-node ${esc(node.kind)}${active ? " active" : ""}" data-node-id="${esc(node.id)}"><rect x="${pos.x - width / 2}" y="${pos.y - 18}" width="${width}" height="36" rx="9" /><text class="graph-node-label" x="${pos.x}" y="${pos.y - 1}" text-anchor="middle">${esc(label)}</text><text class="graph-node-subtitle" x="${pos.x}" y="${pos.y + 11}" text-anchor="middle">${esc(subtitle)}</text><title>${esc(node.label)}</title></g>`;
  }).join("");
  els.graph.innerHTML = `<defs><marker id="graph-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="rgba(159,186,189,.55)" /></marker></defs><g class="graph-edges">${edgeMarkup}</g><g class="graph-nodes">${nodeMarkup}</g>`;
  els.graph.querySelectorAll("[data-node-id]").forEach((node) => node.addEventListener("click", () => selectGraphNode(node.dataset.nodeId)));
}

function updateGraphSelection(node) {
  if (!node) { els.graphSelection.innerHTML = `<span>Select a node</span><small>Graph selection follows the model and the story.</small>`; return; }
  els.graphSelection.innerHTML = `<span>${esc(node.label)}</span><small>${esc(node.subtitle || node.discipline || "Connected coordination interface")}</small>`;
}

function selectGraphNode(nodeId) {
  const node = state.graphNodeById.get(nodeId); if (!node) return;
  state.selectedGraphNodeId = nodeId;
  updateGraphSelection(node);
  if (node.kind === "element" && Number.isInteger(Number(node.step_id))) selectStep(Number(node.step_id), "graph");
  else if (node.group_id) selectGroup(node.group_id, nodeId);
  else if (Number.isInteger(Number(node.step_id))) selectStep(Number(node.step_id), "graph");
  renderGraph();
}

function groupFocusSet(group) { return new Set((group?.focus_step_ids || []).map(Number).filter(Number.isInteger)); }
function changeFocusSet(change) { return new Set([change?.trace?.step_id, change?.trace?.replacement_step_id, ...(change?.target_step_ids || [])].map(Number).filter(Number.isInteger)); }

function applyVisualState() {
  const group = state.groupById.get(state.selectedGroupId);
  const change = state.changeById.get(state.selectedChangeId);
  const focus = groupFocusSet(group);
  const selected = changeFocusSet(change);
  for (const sideName of ["before", "after"]) {
    const side = state.sides[sideName]; if (!side) continue;
    side.highlight?.removeAllMeshes();
    for (const [stepId, meshes] of side.meshByStep.entries()) {
      const inGroup = !group || focus.has(Number(stepId));
      const opacity = group ? (inGroup ? 1 : .12) : 1;
      for (const mesh of meshes) {
        mesh.visibility = opacity;
        mesh.isPickable = opacity > .01;
        if (selected.has(Number(stepId))) side.highlight?.addMesh(mesh, sideName === "before" ? new BABYLON.Color3(.98, .65, .18) : new BABYLON.Color3(.2, .95, .78));
      }
    }
  }
}

function selectGroup(groupId, graphNodeId = `issue:${groupId}`) {
  const group = state.groupById.get(groupId); if (!group) return;
  state.selectedGroupId = groupId;
  state.selectedChangeId = null;
  state.selectedGraphNodeId = graphNodeId;
  renderStoryList();
  renderGroupDetail(group);
  renderTechnical(null);
  applyVisualState();
  renderGraph();
  const firstStep = Number(group.focus_step_ids?.find((step) => state.sides.after?.meshByStep.has(Number(step)) || state.sides.before?.meshByStep.has(Number(step))));
  if (Number.isInteger(firstStep)) updatePickedLabels(firstStep, group.title);
  showToast(`${group.title} · ${group.status}`);
}

function selectChange(changeId, graphNodeId = null) {
  const change = state.changeById.get(changeId); if (!change) return;
  state.selectedGroupId = change.group_id;
  state.selectedChangeId = changeId;
  state.selectedGraphNodeId = graphNodeId || (Number.isInteger(Number(change.trace?.step_id)) ? `element:${change.trace.step_id}` : `issue:${change.group_id}`);
  renderStoryList();
  renderChangeDetail(change);
  renderTechnical(change);
  applyVisualState();
  renderGraph();
  focusChange(change);
  updatePickedLabels(change.trace?.step_id, change.label);
}

function selectStep(stepId, source = "model") {
  const numeric = Number(stepId); if (!Number.isInteger(numeric)) return;
  const ids = state.changesByStep.get(numeric) || [];
  if (ids.length) { selectChange(ids[0], source === "graph" ? `element:${numeric}` : null); return; }
  const node = (state.index.graph?.nodes || []).find((candidate) => Number(candidate.step_id) === numeric);
  state.selectedGraphNodeId = node?.id || null;
  updateGraphSelection(node || { label: "Linked model element", subtitle: "No staged change record" });
  for (const sideName of ["before", "after"]) {
    const side = state.sides[sideName]; side?.highlight?.removeAllMeshes();
    side?.meshByStep.get(numeric)?.forEach((mesh) => side.highlight?.addMesh(mesh, sideName === "before" ? new BABYLON.Color3(.98, .65, .18) : new BABYLON.Color3(.2, .95, .78)));
  }
  updatePickedLabels(numeric, node?.label || "Linked model element");
  renderGraph();
}

function updatePickedLabels(stepId, label) {
  for (const [sideName, element] of [["before", els.beforePicked], ["after", els.afterPicked]]) {
    const side = state.sides[sideName];
    const visible = Number.isInteger(Number(stepId)) && side?.meshByStep.has(Number(stepId));
    element.hidden = !visible;
    if (visible) element.textContent = label || `Element ${stepId}`;
  }
}

function focusChange(change) {
  const steps = [...changeFocusSet(change)];
  for (const sideName of ["before", "after"]) {
    const side = state.sides[sideName]; if (!side) continue;
    const meshes = steps.flatMap((step) => side.meshByStep.get(step) || []);
    if (!meshes.length) continue;
    const bounds = boundsForMeshes(meshes);
    animateCamera(side, { alpha: side.camera.alpha, beta: side.camera.beta, radius: Math.max(bounds.size.length() * 2.9, .75), target: bounds.center.clone() }, 440);
  }
}

function fitBoth(mode = "perspective") { for (const side of [state.sides.before, state.sides.after]) if (side) animateCamera(side, cameraPlan(side, mode), 520); }

function clearSelection() {
  state.selectedGroupId = null; state.selectedChangeId = null; state.selectedGraphNodeId = null;
  renderStoryList();
  els.storyDetail.innerHTML = `<div class="empty-story"><span>✦</span><strong>Select a change</strong><small>Choose a story card, graph node, or model element.</small></div>`;
  renderTechnical(null); updateGraphSelection(null); applyVisualState(); renderGraph();
  [els.beforePicked, els.afterPicked].forEach((element) => { element.hidden = true; });
  showToast("Selection cleared");
}

function pickOnSide(sideName) {
  const side = state.sides[sideName]; if (!side) return;
  const pick = side.scene.pick(side.scene.pointerX, side.scene.pointerY, (mesh) => Number.isInteger(Number(mesh.metadata?.comparisonStep)) && mesh.visibility > .01);
  if (pick?.hit && pick.pickedMesh) selectStep(Number(pick.pickedMesh.metadata.comparisonStep), "model");
}

function bindSceneInput(side) {
  let pointerDown = null;
  side.scene.onPointerObservable.add((info) => {
    const event = info.event;
    if (info.type === BABYLON.PointerEventTypes.POINTERDOWN && event.button === 0) pointerDown = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
    if (info.type === BABYLON.PointerEventTypes.POINTERUP && event.button === 0) {
      const start = pointerDown; pointerDown = null; if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || start.shift || event.shiftKey) return;
      pickOnSide(side.name);
    }
  });
}

function setMode(mode) {
  state.mode = mode === "overlay" ? "overlay" : "split";
  els.workspace.dataset.mode = state.mode;
  document.querySelectorAll("[data-mode]").forEach((button) => { if (button.matches("button")) button.classList.toggle("active", button.dataset.mode === state.mode); });
}

function setOverlayOpacity(value) {
  state.beforeOpacity = Number(value);
  els.workspace.style.setProperty("--before-opacity", state.beforeOpacity);
  els.opacity.value = String(state.beforeOpacity);
  els.opacityValue.textContent = `${Math.round(state.beforeOpacity * 100)}%`;
}

function togglePlay() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer); state.playTimer = null;
    document.querySelectorAll('[data-action="play"]').forEach((button) => { button.textContent = button.id === "timeline-play" ? "▶" : "Play changes"; });
    return;
  }
  state.playIndex = 0;
  const playNext = () => {
    const group = state.groups[state.playIndex % state.groups.length];
    selectGroup(group.id);
    els.timelineProgress.style.width = `${((state.playIndex + 1) / state.groups.length) * 100}%`;
    state.playIndex += 1;
  };
  playNext();
  state.playTimer = window.setInterval(playNext, 4200);
  document.querySelectorAll('[data-action="play"]').forEach((button) => { button.textContent = button.id === "timeline-play" ? "Ⅱ" : "Pause"; });
}

function togglePanel(panel) { panel.dataset.open = panel.dataset.open !== "true" ? "true" : "false"; }

function bindInterface() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button"); if (!target) return;
    if (target.dataset.group) { selectGroup(target.dataset.group); return; }
    if (target.dataset.change) { selectChange(target.dataset.change); return; }
    const action = target.dataset.action;
    if (action === "toggle-story") { togglePanel(els.storyDock); return; }
    if (action === "toggle-graph") { togglePanel(els.graphDock); return; }
    if (action === "toggle-technical") { togglePanel(els.technicalDrawer); return; }
    if (action === "play") { togglePlay(); return; }
    if (action === "fit-both") { fitBoth(); showToast("Both views fitted"); return; }
    if (action === "clear-selection") { clearSelection(); return; }
    const camera = target.dataset.camera;
    if (camera) {
      const side = state.sides[target.dataset.side];
      if (side) { if (camera === "fit" || camera === "reset") animateCamera(side, cameraPlan(side), 500); else animateCamera(side, cameraPlan(side, camera), 500); }
      return;
    }
    if (target.dataset.mode) { setMode(target.dataset.mode); return; }
  });
  els.opacity.addEventListener("input", () => setOverlayOpacity(els.opacity.value));
  els.syncCameras.addEventListener("change", () => { state.syncCameras = els.syncCameras.checked; showToast(state.syncCameras ? "Camera sync enabled" : "Camera sync paused"); });
  document.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.key === "Escape") { if (state.playTimer) togglePlay(); else clearSelection(); }
    if (event.key === " ") { event.preventDefault(); togglePlay(); }
    if (event.key.toLowerCase() === "f") fitBoth();
    if (event.key.toLowerCase() === "g") togglePanel(els.graphDock);
    if (event.key.toLowerCase() === "s") togglePanel(els.storyDock);
  });
}

function bindCameraSync() {
  const driver = () => state.cameraDriver;
  const tick = () => { if (!state.syncCameras) return; const source = state.sides[driver()]; const target = state.sides[driver() === "before" ? "after" : "before"]; if (source && target) copyCamera(source, target); };
  if (state.sides.before) state.sides.before.scene.onBeforeRenderObservable.add(tick);
}

async function init() {
  try {
    bindInterface();
    setStatus("Loading comparison evidence");
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Comparison index returned ${response.status}`);
    state.index = await response.json();
    buildChangeMaps();
    renderSummary(); renderStoryList(); renderGraph(); setOverlayOpacity(.48);
    state.sides.before = createSide("before", state.index.authoritative_source.browser_geometry.url, $("#before-canvas"), els.beforeLoading, new BABYLON.Color3(.95, .66, .25));
    state.sides.after = createSide("after", state.index.revised_model.browser_geometry.url, $("#after-canvas"), els.afterLoading, new BABYLON.Color3(.24, .82, .72));
    bindSceneInput(state.sides.before); bindSceneInput(state.sides.after);
    setStatus("Loading source and revised geometry");
    await Promise.all([loadSide(state.sides.before, state.index.authoritative_source.browser_geometry.url), loadSide(state.sides.after, state.index.revised_model.browser_geometry.url)]);
    bindCameraSync();
    fitBoth("perspective");
    setStatus(`Comparison ready · ${formatNumber(state.index.summary.comparison_records)} linked records`, "ready");
    showToast("Select a story, graph node, or model element");
  } catch (error) {
    console.error(error);
    setStatus("Comparison failed to load", "error");
    showToast(error.message || "Comparison failed to load");
  }
}

init();
