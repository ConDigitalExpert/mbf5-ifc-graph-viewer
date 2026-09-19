/* global BABYLON */

const DATA_URL = "./data/viewer_index.json";
const DEFAULT_GEOMETRY_URL = "./data/MBF5-TEST-COORDINATION.hallway-coordination.scene.glb";
const SAVED_VIEWS_KEY = "mbf5-coordination-saved-views-v1";

const els = {
  schema: document.querySelector("#schema-badge"),
  status: document.querySelector("#load-status"),
  viewer: document.querySelector("#viewer-container"),
  viewerLoading: document.querySelector(".viewer-loading"),
  viewerMessage: document.querySelector("#viewer-message"),
  search: document.querySelector("#node-search"),
  searchClear: document.querySelector("#search-clear"),
  nodeList: document.querySelector("#node-list"),
  nodeCount: document.querySelector("#node-count"),
  listCaption: document.querySelector("#list-caption"),
  listCount: document.querySelector("#list-count"),
  detail: document.querySelector("#selection-detail"),
  sourceHash: document.querySelector("#source-hash"),
  metricElements: document.querySelector("#metric-elements"),
  metricPorts: document.querySelector("#metric-ports"),
  metricEdges: document.querySelector("#metric-edges"),
  metricIntegrity: document.querySelector("#metric-integrity"),
  frameworkBadge: document.querySelector("#framework-badge"),
  stage2State: document.querySelector("#stage2-state"),
  cameraHelp: document.querySelector("#camera-help"),
  cameraReadout: document.querySelector("#camera-readout"),
  projectionLabel: document.querySelector("#projection-label"),
  selectionHudTitle: document.querySelector("#selection-hud-title"),
  selectionHudId: document.querySelector("#selection-hud-id"),
  walkthroughHud: document.querySelector("#walkthrough-hud"),
  measureHud: document.querySelector("#measure-hud"),
  measureHudValue: document.querySelector("#measure-hud-value"),
  fpsReadout: document.querySelector("#fps-readout"),
  viewportHint: document.querySelector("#viewport-hint"),
  toast: document.querySelector("#toast"),
  toolsPanel: document.querySelector("#tools-panel"),
  inspectorPanel: document.querySelector("#inspector-panel"),
  sectionPanel: document.querySelector("#section-panel"),
  sectionStatus: document.querySelector("#section-status"),
  sectionReadout: document.querySelector("#section-readout"),
  sectionRangeSummary: document.querySelector("#section-range-summary"),
  visibilityCount: document.querySelector("#visibility-count"),
  disciplineFilter: document.querySelector("#discipline-filter"),
  levelFilter: document.querySelector("#level-filter"),
  systemFilter: document.querySelector("#system-filter"),
  savedViewSelect: document.querySelector("#saved-view-select"),
  savedViewDialog: document.querySelector("#saved-view-dialog"),
  savedViewForm: document.querySelector("#saved-view-form"),
  savedViewName: document.querySelector("#saved-view-name"),
  savedViewNameCount: document.querySelector("#saved-view-name-count"),
  savedViewNameError: document.querySelector("#saved-view-name-error"),
};

const state = {
  index: null,
  bridge: null,
  bridgeByStep: new Map(),
  viewer: null,
  selectedStep: null,
  coordinateFrame: null,
  allNodes: [],
  nodeByStep: new Map(),
  edgeByIndex: [],
  systemMembers: new Map(),
  searchTerm: "",
  viewMode: "perspective",
  projection: "perspective",
  navigationMode: "orbit",
  filters: { discipline: "all", level: "all", system: "all" },
  visibilityMode: "normal",
  hiddenSteps: new Set(),
  isolatedStep: null,
  savedViews: [],
  savedViewDialogOpen: false,
  savedViewPreviousFocus: null,
  section: { enabled: false, values: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 } },
  measure: { active: false, points: [], markers: [], line: null },
};

function formatNumber(value) { return Number(value || 0).toLocaleString("en-US"); }
function formatDistance(meters) { return meters < 1 ? `${Math.round(meters * 1000)} mm` : `${meters.toFixed(2)} m`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function setStatus(message, mode = "") { els.status.className = `status-line ${mode}`.trim(); els.status.innerHTML = `<i class="status-dot"></i>${escapeHtml(message)}`; }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("visible"); window.clearTimeout(state.toastTimer); state.toastTimer = window.setTimeout(() => els.toast.classList.remove("visible"), 2200); }
function nodeLabel(node) { return node?.name || node?.object_type || `${node?.entity_type || "IFC node"} #${node?.step_id ?? "?"}`; }
function nodeForStep(stepId) { return state.nodeByStep.get(Number(stepId)) || { step_id: Number(stepId), entity_type: "Referenced IFC node", name: `STEP #${stepId}`, global_id: null }; }
function bridgeForStep(stepId) { return state.bridgeByStep.get(Number(stepId)) || null; }
function searchableText(node) { return [node.name, node.global_id, node.entity_type, node.object_type, node.tag, node.description, node.step_id].filter(Boolean).join(" ").toLowerCase(); }

function disciplineForNode(node) {
  const text = searchableText(node);
  if (/sprinkler|fire protection|fireproof|wet fire|standpipe|fp\b/.test(text)) return "fire";
  if (/light|lighting|electrical|conduit|unistrut|power|receptacle|outlet|switch|cable|wire/.test(text)) return "electrical";
  if (/plumb|domestic|sanitary|water|drain|waste|d[hc]w\b|soil/.test(text)) return "plumbing";
  if (/duct|air terminal|hvac|mechanical|glycol|valve|damper|fan|pump|equipment|terminal|grille/.test(text)) return "mechanical";
  if (/beam|column|slab|struct|foundation|footing|steel/.test(text)) return "structure";
  if (/wall|door|window|ceiling|floor|roof|space|opening|covering/.test(text)) return "architecture";
  return "other";
}

function levelForNode(node) {
  const text = [node?.name, node?.object_type, node?.description, node?.tag].filter(Boolean).join(" ");
  if (/\bmain floor\b/i.test(text)) return "MAIN FLOOR";
  if (/\bground floor\b/i.test(text)) return "GROUND FLOOR";
  if (/\broof\b/i.test(text)) return "ROOF";
  if (/\bbasement\b/i.test(text)) return "BASEMENT";
  const level = text.match(/\blevel\s+(\d+)\b/i);
  return level ? `LEVEL ${level[1]}` : "UNASSIGNED";
}

function edgeIndexesFor(stepId) {
  const indexes = state.index?.edge_index_by_node?.[String(stepId)] || [];
  return indexes.map((index) => state.edgeByIndex[index]).filter(Boolean);
}

function buildSystemMembership() {
  state.systemMembers.clear();
  const systemSteps = new Set(state.allNodes.filter((node) => node.entity_type === "IfcSystem").map((node) => Number(node.step_id)));
  for (const step of systemSteps) state.systemMembers.set(step, new Set([step]));
  for (const edge of state.edgeByIndex) {
    if (systemSteps.has(Number(edge.source_step_id))) state.systemMembers.get(Number(edge.source_step_id))?.add(Number(edge.target_step_id));
    if (systemSteps.has(Number(edge.target_step_id))) state.systemMembers.get(Number(edge.target_step_id))?.add(Number(edge.source_step_id));
  }
}

function populateFilters() {
  const levels = [...new Set(state.allNodes.map(levelForNode))].sort();
  els.levelFilter.innerHTML = `<option value="all">All levels / branches</option>${levels.map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`).join("")}`;
  const systems = state.allNodes.filter((node) => node.entity_type === "IfcSystem").sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));
  els.systemFilter.innerHTML = `<option value="all">All systems</option>${systems.map((node) => `<option value="${node.step_id}">${escapeHtml(nodeLabel(node))}</option>`).join("")}`;
}

function nodeMatchesFilters(node) {
  if (state.filters.discipline !== "all" && disciplineForNode(node) !== state.filters.discipline) return false;
  if (state.filters.level !== "all" && levelForNode(node) !== state.filters.level) return false;
  if (state.filters.system !== "all") {
    const members = state.systemMembers.get(Number(state.filters.system));
    if (!members?.has(Number(node.step_id))) return false;
  }
  return true;
}

function renderNodeList() {
  if (!els.nodeList) return;
  const query = state.searchTerm.trim().toLowerCase();
  const matched = state.allNodes.filter((node) => nodeMatchesFilters(node) && (!query || searchableText(node).includes(query)));
  const visible = matched.slice(0, 280);
  els.listCount.textContent = `${formatNumber(matched.length)} match${matched.length === 1 ? "" : "es"}`;
  els.listCaption.textContent = query || state.filters.discipline !== "all" || state.filters.level !== "all" || state.filters.system !== "all" ? "Filtered graph results" : "Graph nodes with model identity";
  els.nodeList.innerHTML = visible.length ? visible.map((node) => `<button class="node-row ${state.selectedStep === node.step_id ? "selected" : ""}" data-step="${node.step_id}" role="option" aria-selected="${state.selectedStep === node.step_id}"><span class="node-pip"></span><span class="node-main"><span class="node-title">${escapeHtml(nodeLabel(node))}</span><span class="node-meta"><span>${escapeHtml(node.entity_type)}</span>${node.global_id ? `<span>${escapeHtml(node.global_id)}</span>` : ""}</span></span><span class="node-step">#${node.step_id}</span></button>`).join("") : `<div class="list-empty">No graph nodes match “${escapeHtml(query || "these filters") }”. Refine the filters or search a GlobalId / STEP number.</div>`;
  if (matched.length > visible.length) els.nodeList.insertAdjacentHTML("beforeend", `<div class="list-empty">Showing the first ${formatNumber(visible.length)} results. Refine the search to narrow the list.</div>`);
  els.nodeList.querySelectorAll(".node-row").forEach((button) => button.addEventListener("click", () => selectStep(Number(button.dataset.step), "graph")));
}

function renderRelationships(stepId) {
  const edges = edgeIndexesFor(stepId);
  if (!edges.length) return `<p class="relationship-source">No explicit semantic relationship edges are attached to this node.</p>`;
  return `<div class="relationship-list">${edges.slice(0, 90).map((edge) => { const outgoing = Number(edge.source_step_id) === Number(stepId); const otherStep = outgoing ? edge.target_step_id : edge.source_step_id; const other = nodeForStep(otherStep); return `<div class="relationship-row"><span class="relationship-direction" aria-hidden="true">${outgoing ? "→" : "←"}</span><button class="relationship-node" data-step="${otherStep}"><strong>${escapeHtml(nodeLabel(other))}</strong><span>${escapeHtml(other.entity_type)} · #${otherStep}</span></button><span class="relationship-predicate" title="${escapeHtml(edge.predicate)}">${escapeHtml(edge.predicate)}</span></div>`; }).join("")}</div>${edges.length > 90 ? `<p class="relationship-source">Showing 90 of ${formatNumber(edges.length)} explicit edges.</p>` : ""}`;
}

function renderDetail(stepId, source) {
  const node = nodeForStep(stepId);
  const bridge = bridgeForStep(stepId);
  const geometry = bridge?.geometry;
  const mesh = state.viewer?.meshByStep.get(Number(stepId));
  const globalId = node.global_id || bridge?.ifc_global_id || null;
  const stage2 = state.index?.stage2 || {};
  const stage2State = state.index?.stage2_state || stage2.state || "prepared-dry-run-only";
  const origin = state.coordinateFrame?.model_origin_m;
  const originLabel = Array.isArray(origin) ? origin.map((value) => Number(value).toFixed(4)).join(", ") : "not declared";
  const stage2Evidence = stage2.edit_manifest_url ? `<div class="detail-section-label">Stage 2 evidence</div><div class="property-line"><span>Edit manifest</span><strong><a href="${escapeHtml(stage2.edit_manifest_url)}" target="_blank" rel="noreferrer">open JSON ↗</a></strong></div>${stage2.impact_report_url ? `<div class="property-line"><span>Impact report</span><strong><a href="${escapeHtml(stage2.impact_report_url)}" target="_blank" rel="noreferrer">open JSON ↗</a></strong></div>` : ""}${stage2.validation_url ? `<div class="property-line"><span>Validation</span><strong><a href="${escapeHtml(stage2.validation_url)}" target="_blank" rel="noreferrer">open JSON ↗</a></strong></div>` : ""}` : "";
  els.detail.className = "selection-detail";
  els.detail.innerHTML = `<div class="detail-head"><div><h3 class="detail-title">${escapeHtml(nodeLabel(node))}</h3><div class="detail-type">${escapeHtml(node.entity_type)}</div></div><div class="detail-head-actions"><button class="detail-focus" type="button" data-camera-action="focus-selected" ${mesh ? "" : "disabled"}>Focus</button><span class="detail-step">#${stepId}</span></div></div><div class="detail-id"><span>GlobalId</span><code>${escapeHtml(globalId || "not assigned")}</code>${globalId ? `<button class="copy-button" type="button" data-copy="${escapeHtml(globalId)}">Copy</button>` : ""}</div><div class="detail-tags"><span class="tag accent">${escapeHtml(disciplineForNode(node))}</span>${node.object_type ? `<span class="tag">${escapeHtml(node.object_type)}</span>` : ""}${node.tag ? `<span class="tag">Tag ${escapeHtml(node.tag)}</span>` : ""}<span class="tag">${source === "model" ? "picked in 3D" : "picked in graph"}</span></div><div class="detail-section-label">IFC / scene bridge</div><div class="property-line"><span>IFC STEP id</span><strong>#${stepId}</strong></div><div class="property-line"><span>IFC class</span><strong>${escapeHtml(node.entity_type || "—")}</strong></div><div class="property-line"><span>Level / branch</span><strong>${escapeHtml(levelForNode(node))}</strong></div><div class="property-line"><span>Mapped geometry</span><strong>${mesh ? "loaded glTF node" : geometry?.represented ? "mapped, not loaded" : "no preview mesh"}</strong></div><div class="property-line"><span>OpenUSD prim</span><strong>${escapeHtml(geometry?.usd_prim_path || "none")}</strong></div><div class="property-line"><span>Geometry id</span><strong>${escapeHtml(geometry?.geometry_id || "none")}</strong></div><div class="property-line"><span>Local + origin</span><strong>[${escapeHtml(originLabel)}] m</strong></div>${node.description ? `<div class="detail-copy"><strong>Source description</strong><span>${escapeHtml(node.description)}</span></div>` : ""}<div class="detail-section-label">Stage 2 branch</div><div class="property-line"><span>Viewer state</span><strong>${escapeHtml(stage2State)}</strong></div>${stage2.edit_delta_mm ? `<div class="property-line"><span>Applied delta</span><strong>${stage2.edit_delta_mm.map((value) => Number(value).toFixed(0)).join(", ")} mm</strong></div>` : ""}${stage2Evidence}<div class="detail-section-label">Explicit graph interfaces · ${formatNumber(edgeIndexesFor(stepId).length)}</div>${renderRelationships(stepId)}`;
  els.detail.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => selectStep(Number(button.dataset.step), "graph")));
  updateSelectionHud(node, globalId);
}

function updateSelectionHud(node = null, globalId = null) { els.selectionHudTitle.textContent = node ? nodeLabel(node) : "Nothing selected"; els.selectionHudId.textContent = node ? `#${node.step_id} · ${globalId || "GlobalId not assigned"}` : "Click a model element or graph node"; }

function parseStepId(name) { const match = String(name || "").match(/(?:^|-)id-(\d+)(?:$|-)/); return match ? Number(match[1]) : null; }
function stepForNode(node) { let current = node; while (current) { if (Number.isInteger(current.metadata?.ifc_step_id)) return current.metadata.ifc_step_id; const parsed = parseStepId(current.name); if (parsed !== null) return parsed; current = current.parent; } return null; }
function splitAssetUrl(url) { const clean = String(url || "").split("?")[0]; const slash = clean.lastIndexOf("/"); return { root: slash >= 0 ? `${clean.slice(0, slash + 1)}` : "./", file: clean.slice(slash + 1) }; }

function boundsForMeshes(meshes) {
  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity); const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity); let count = 0;
  for (const mesh of meshes) { if (!mesh.getBoundingInfo || mesh.getTotalVertices?.() === 0) continue; mesh.computeWorldMatrix(true); const box = mesh.getBoundingInfo().boundingBox; min.minimizeInPlace(box.minimumWorld); max.maximizeInPlace(box.maximumWorld); count += 1; }
  if (!count) throw new Error("Scene contains no renderable mapped meshes");
  return { min, max, center: min.add(max).scale(.5), size: max.subtract(min) };
}

function createBabylonViewer() {
  const canvas = document.createElement("canvas"); canvas.className = "model-canvas"; canvas.setAttribute("aria-label", "OpenUSD-backed BIM scene rendered as glTF"); els.viewer.insertBefore(canvas, els.viewer.firstChild);
  const engine = new BABYLON.Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: false }); const pixelRatio = window.devicePixelRatio || 1; engine.setHardwareScalingLevel(Math.max(1.15, Math.min(1.5, pixelRatio)));
  const scene = new BABYLON.Scene(engine); scene.clearColor = new BABYLON.Color4(.025, .05, .062, 1); scene.imageProcessingConfiguration.toneMappingEnabled = true; scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES; scene.imageProcessingConfiguration.exposure = 1.08; scene.imageProcessingConfiguration.contrast = 1.13;
  const orbitCamera = new BABYLON.ArcRotateCamera("bim-orbit-camera", -Math.PI / 2.35, Math.PI / 2.95, 50, BABYLON.Vector3.Zero(), scene);
  orbitCamera.attachControl(canvas, true); orbitCamera.panningSensibility = 75; orbitCamera.panningInertia = .87; orbitCamera.inertia = .88; orbitCamera.wheelDeltaPercentage = .009; orbitCamera.wheelPrecision = 24; orbitCamera.lowerRadiusLimit = .1; orbitCamera.upperRadiusLimit = 100000; orbitCamera.useBouncingBehavior = false; orbitCamera.lowerBetaLimit = .035; orbitCamera.upperBetaLimit = Math.PI - .035; orbitCamera.useCtrlForPanning = false; orbitCamera.panningMouseButton = 1;
  const walkCamera = new BABYLON.UniversalCamera("bim-walk-camera", new BABYLON.Vector3(0, 0, 0), scene); walkCamera.speed = 0.04; walkCamera.inertia = .72; walkCamera.angularSensibility = 3600; walkCamera.keysUp = [87, 38]; walkCamera.keysDown = [83, 40]; walkCamera.keysLeft = [65, 37]; walkCamera.keysRight = [68, 39]; walkCamera.minZ = .01; walkCamera.maxZ = 100000; walkCamera.detachControl();
  const hemispheric = new BABYLON.HemisphericLight("bim-fill", new BABYLON.Vector3(.15, 1, .25), scene); hemispheric.intensity = 1.35; hemispheric.diffuse = new BABYLON.Color3(.82, .9, 1); hemispheric.groundColor = new BABYLON.Color3(.07, .13, .16);
  const key = new BABYLON.DirectionalLight("bim-key", new BABYLON.Vector3(-.45, -1, .55), scene); key.position = new BABYLON.Vector3(160, 220, 100); key.intensity = 2.0;
  const rim = new BABYLON.DirectionalLight("bim-rim", new BABYLON.Vector3(.55, -.35, -.75), scene); rim.position = new BABYLON.Vector3(-120, 120, -180); rim.diffuse = new BABYLON.Color3(.24, .7, .68); rim.intensity = .78;
  const pipeline = new BABYLON.DefaultRenderingPipeline("bim-rendering", true, scene, [orbitCamera, walkCamera]); pipeline.fxaaEnabled = true; pipeline.samples = 1; pipeline.sharpenEnabled = true; pipeline.sharpen.edgeAmount = .16; pipeline.bloomEnabled = false;
  const viewer = { canvas, engine, scene, orbitCamera, walkCamera, activeCamera: orbitCamera, modelRoot: null, meshByStep: new Map(), meshesByStep: new Map(), selectedMeshes: new Set(), hoveredMeshes: new Set(), cameraTransition: null, pointerDown: null, shadowGenerator: null, resizeObserver: null, highlightLayer: BABYLON.HighlightLayer ? new BABYLON.HighlightLayer("bim-selection", scene) : null, hoverLayer: BABYLON.HighlightLayer ? new BABYLON.HighlightLayer("bim-hover", scene) : null, sectionHandles: new Map(), sectionLines: [], modelBounds: null, fpsTimer: null };
  if (viewer.highlightLayer) viewer.highlightLayer.innerGlow = false; if (viewer.hoverLayer) viewer.hoverLayer.innerGlow = false;
  const resize = () => { engine.resize(); updateOrthoFrustum(); }; viewer.resizeObserver = new ResizeObserver(resize); viewer.resizeObserver.observe(els.viewer);
  engine.runRenderLoop(() => scene.render()); viewer.fpsTimer = window.setInterval(() => { if (els.fpsReadout && Number.isFinite(engine.getFps())) els.fpsReadout.textContent = `${Math.round(engine.getFps())} fps`; }, 1000);
  return viewer;
}

function registerSceneNodes(nodes) {
  for (const node of nodes) {
    const stepId = stepForNode(node); if (!Number.isInteger(stepId)) continue;
    node.metadata = { ...(node.metadata || {}), ifc_step_id: stepId };
    if (!state.viewer.meshesByStep.has(stepId)) state.viewer.meshesByStep.set(stepId, []);
    state.viewer.meshesByStep.get(stepId).push(node); if (!state.viewer.meshByStep.has(stepId)) state.viewer.meshByStep.set(stepId, node);
    node.metadata.baseVisibility = node.visibility; node.metadata.modelMesh = true; node.isPickable = true; node.receiveShadows = true;
    if (node.material && node.material.albedoColor) node.material.roughness = Math.min(Math.max(Number(node.material.roughness || .42), .28), .82);
  }
}

function addPresentationContext(bounds) {
  const maxDim = Math.max(bounds.size.x, bounds.size.y, bounds.size.z, 1); const gridSize = Math.max(maxDim * 1.55, 10); const ground = BABYLON.MeshBuilder.CreateGround("presentation-ground", { width: gridSize, height: gridSize, subdivisions: 2 }, state.viewer.scene); ground.position.y = bounds.min.y - maxDim * .02; ground.metadata = { helper: true };
  const groundMaterial = new BABYLON.StandardMaterial("presentation-ground-material", state.viewer.scene); groundMaterial.diffuseColor = new BABYLON.Color3(.035, .078, .09); groundMaterial.specularColor = new BABYLON.Color3(.04, .08, .09); groundMaterial.alpha = .55; ground.material = groundMaterial; ground.receiveShadows = false;
}

function shortestAngleDelta(from, to) { return ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI; }
function cameraPlan(bounds, mode = "perspective") { const maxDim = Math.max(bounds.size.x, bounds.size.y, bounds.size.z, 1); const plan = { alpha: -Math.PI / 2.35, beta: Math.PI / 2.95, radius: maxDim * 1.45, target: bounds.center.clone() }; if (mode === "top") { plan.alpha = -Math.PI / 2; plan.beta = .08; plan.radius = maxDim * 1.6; } else if (mode === "front") { plan.alpha = -Math.PI / 2; plan.beta = Math.PI / 2; plan.radius = maxDim * 1.52; } else if (mode === "right") { plan.alpha = 0; plan.beta = Math.PI / 2; plan.radius = maxDim * 1.52; } return plan; }

function updateOrthoFrustum() { if (!state.viewer || state.viewer.orbitCamera.mode !== BABYLON.Camera.ORTHOGRAPHIC_CAMERA || !state.viewer.modelBounds) return; const aspect = state.viewer.engine.getRenderWidth() / Math.max(state.viewer.engine.getRenderHeight(), 1); const height = Math.max(state.viewer.orbitCamera.radius * .72, 1); state.viewer.orbitCamera.orthoTop = height; state.viewer.orbitCamera.orthoBottom = -height; state.viewer.orbitCamera.orthoRight = height * aspect; state.viewer.orbitCamera.orthoLeft = -height * aspect; }
function applyProjection(mode) { if (!state.viewer) return; const camera = state.viewer.orbitCamera; state.projection = mode === "orthographic" ? "orthographic" : "perspective"; camera.mode = state.projection === "orthographic" ? BABYLON.Camera.ORTHOGRAPHIC_CAMERA : BABYLON.Camera.PERSPECTIVE_CAMERA; updateOrthoFrustum(); els.projectionLabel.textContent = state.projection === "orthographic" ? "ORTHO" : "PERS"; }
function updateViewMode(mode) { state.viewMode = mode; document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === mode)); els.cameraReadout.textContent = `${state.projection === "orthographic" ? "ORTHO" : "PERSPECTIVE"} · ${mode === "perspective" ? "ISO" : mode.toUpperCase()}`; }

function animateCameraTo(plan, duration = 540) { if (!state.viewer || state.navigationMode === "walk") setNavigationMode("orbit"); const camera = state.viewer.orbitCamera; if (state.viewer.cameraTransition?.observer) state.viewer.scene.onBeforeRenderObservable.remove(state.viewer.cameraTransition.observer); const target = plan.target.clone(); const start = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() }; const alphaDelta = shortestAngleDelta(start.alpha, plan.alpha); if (!duration) { camera.alpha = plan.alpha; camera.beta = plan.beta; camera.radius = plan.radius; camera.target.copyFrom(target); updateOrthoFrustum(); state.viewer.cameraTransition = null; return; } const started = performance.now(); const observer = state.viewer.scene.onBeforeRenderObservable.add(() => { const raw = Math.min(1, (performance.now() - started) / duration); const eased = 1 - Math.pow(1 - raw, 3); camera.alpha = start.alpha + alphaDelta * eased; camera.beta = start.beta + (plan.beta - start.beta) * eased; camera.radius = start.radius + (plan.radius - start.radius) * eased; camera.target.copyFrom(BABYLON.Vector3.Lerp(start.target, target, eased)); updateOrthoFrustum(); if (raw >= 1) { state.viewer.scene.onBeforeRenderObservable.remove(observer); state.viewer.cameraTransition = null; } }); state.viewer.cameraTransition = { observer }; }
function frameBounds(bounds, mode = "perspective", animate = true) { if (!state.viewer || !bounds) return; updateViewMode(mode); animateCameraTo(cameraPlan(bounds, mode), animate ? 560 : 0); }
function focusMesh(mesh, animate = true) { if (!mesh) return; if (state.navigationMode === "walk") setNavigationMode("orbit"); mesh.computeWorldMatrix(true); const box = mesh.getBoundingInfo().boundingBox; const size = box.extendSizeWorld.scale(2); animateCameraTo({ alpha: state.viewer.orbitCamera.alpha, beta: state.viewer.orbitCamera.beta, radius: Math.max(size.length() * 2.25, 1), target: box.centerWorld.clone() }, animate ? 480 : 0); }

function updateHighlight(stepId) { if (!state.viewer) return; state.viewer.highlightLayer?.removeAllMeshes(); state.viewer.hoverLayer?.removeAllMeshes(); state.viewer.selectedMeshes.clear(); if (!Number.isInteger(Number(stepId))) return; const selected = state.viewer.meshesByStep.get(Number(stepId)) || []; selected.forEach((mesh) => { state.viewer.selectedMeshes.add(mesh); state.viewer.highlightLayer?.addMesh(mesh, new BABYLON.Color3(.98, .68, .2)); }); }
function updateHover(mesh) { if (!state.viewer) return; state.viewer.hoverLayer?.removeAllMeshes(); state.viewer.hoveredMeshes.clear(); if (!mesh) return; const step = stepForNode(mesh); if (Number(step) === Number(state.selectedStep)) return; (state.viewer.meshesByStep.get(Number(step)) || [mesh]).forEach((piece) => { if (piece.visibility > .01) { state.viewer.hoveredMeshes.add(piece); state.viewer.hoverLayer?.addMesh(piece, new BABYLON.Color3(.25, .88, .8)); } }); }
function clearHighlight() { state.viewer?.highlightLayer?.removeAllMeshes(); state.viewer?.hoverLayer?.removeAllMeshes(); state.viewer?.selectedMeshes.clear(); state.viewer?.hoveredMeshes.clear(); }

function nodeIsVisibleByFilter(node) { return nodeMatchesFilters(node); }
function applyVisibility() {
  if (!state.viewer) return; let hiddenCount = 0;
  for (const [stepId, meshes] of state.viewer.meshesByStep.entries()) {
    const node = nodeForStep(stepId); const filterVisible = nodeIsVisibleByFilter(node); const isolated = state.isolatedStep === null || Number(state.isolatedStep) === Number(stepId); const manuallyHidden = state.hiddenSteps.has(Number(stepId)); const visible = filterVisible && isolated && !manuallyHidden; if (!visible) hiddenCount += meshes.length;
    const selected = Number(state.selectedStep) === Number(stepId); let opacity = 1; if (state.visibilityMode === "ghost") opacity = selected ? 1 : .24; if (state.visibilityMode === "xray") opacity = selected ? 1 : .34;
    meshes.forEach((mesh) => { mesh.visibility = visible ? opacity : 0; mesh.isPickable = visible; });
  }
  els.visibilityCount.textContent = hiddenCount ? `${formatNumber(hiddenCount)} hidden` : state.visibilityMode === "normal" ? "All visible" : state.visibilityMode.toUpperCase();
  updateHighlight(state.selectedStep);
}

function clearSelection() { state.selectedStep = null; state.isolatedStep = null; clearHighlight(); renderNodeList(); els.detail.className = "selection-detail empty-detail"; els.detail.innerHTML = `<div class="empty-icon">◎</div><p>Select an element to inspect it</p><small>Pick geometry or a graph node. The selection remains linked by IFC identity.</small>`; updateSelectionHud(); setStatus(`Model ready · ${formatNumber(state.viewer?.meshByStep.size || 0)} mapped elements · candidate handoff pending`, "ready"); applyVisibility(); }
async function selectStep(stepId, source = "graph") { const numeric = Number(stepId); if (!Number.isInteger(numeric)) return; state.selectedStep = numeric; const node = nodeForStep(numeric); renderNodeList(); updateHighlight(numeric); renderDetail(numeric, source); els.detail.scrollTop = 0; if (source === "graph") focusMesh(state.viewer?.meshByStep.get(numeric), true); applyVisibility(); }

function pickMappedMesh() { if (!state.viewer?.scene) return null; const pick = state.viewer.scene.pick(state.viewer.scene.pointerX, state.viewer.scene.pointerY, (mesh) => stepForNode(mesh) !== null && mesh.metadata?.modelMesh && mesh.visibility > .01); return pick?.hit ? pick.pickedMesh : null; }
function pickMeasurePoint() { if (!state.viewer?.scene) return null; const pick = state.viewer.scene.pick(state.viewer.scene.pointerX, state.viewer.scene.pointerY, (mesh) => mesh.metadata?.modelMesh && mesh.visibility > .01); return pick?.hit && pick.pickedPoint ? pick.pickedPoint.clone() : null; }

function createMeasureMarker(point) { const marker = BABYLON.MeshBuilder.CreateSphere(`measure-marker-${state.measure.markers.length}`, { diameter: Math.max(state.viewer.modelBounds.size.length() * .008, .04), segments: 12 }, state.viewer.scene); const material = new BABYLON.StandardMaterial(`measure-marker-material-${state.measure.markers.length}`, state.viewer.scene); material.diffuseColor = new BABYLON.Color3(.96, .72, .18); material.emissiveColor = new BABYLON.Color3(.35, .18, .03); marker.material = material; marker.position.copyFrom(point); marker.metadata = { helper: true }; marker.isPickable = false; state.measure.markers.push(marker); }
function clearMeasure() { state.measure.markers.forEach((marker) => marker.dispose()); state.measure.markers = []; state.measure.line?.dispose(); state.measure.line = null; state.measure.points = []; els.measureHudValue.textContent = "Distance will appear here"; }
function handleMeasurePoint(point) { if (!point) return; state.measure.points.push(point); createMeasureMarker(point); if (state.measure.points.length === 2) { const [a, b] = state.measure.points; state.measure.line = BABYLON.MeshBuilder.CreateLines("measure-line", { points: [a, b] }, state.viewer.scene); state.measure.line.color = new BABYLON.Color3(.96, .72, .18); state.measure.line.metadata = { helper: true }; state.measure.line.isPickable = false; const distance = BABYLON.Vector3.Distance(a, b); els.measureHudValue.textContent = `${formatDistance(distance)} · ${distance.toFixed(3)} m`; showToast(`Measured ${formatDistance(distance)}`); } }
function setMeasureActive(active) { state.measure.active = Boolean(active); if (!active) clearMeasure(); els.measureHud.hidden = !state.measure.active; document.querySelectorAll('[data-action="toggle-measure"]').forEach((button) => button.classList.toggle("active", state.measure.active)); if (state.measure.active) showToast("Measure mode · pick two points"); }

function updateSectionSliders() { const values = state.section.values; document.querySelectorAll("[data-section-axis]").forEach((input) => { input.value = values[input.dataset.sectionAxis]; }); document.querySelectorAll("[data-section-output]").forEach((output) => { output.textContent = `${Math.round(values[output.dataset.sectionOutput] * 100)}%`; }); }
function sectionWorldBounds() { const b = state.viewer?.modelBounds; const v = state.section.values; if (!b) return null; return { minX: b.min.x + b.size.x * v.minX, maxX: b.min.x + b.size.x * v.maxX, minY: b.min.y + b.size.y * v.minY, maxY: b.min.y + b.size.y * v.maxY, minZ: b.min.z + b.size.z * v.minZ, maxZ: b.min.z + b.size.z * v.maxZ }; }
function sectionSummary() { const v = state.section.values; return `X ${Math.round(v.minX * 100)}–${Math.round(v.maxX * 100)} · Y ${Math.round(v.minY * 100)}–${Math.round(v.maxY * 100)} · Z ${Math.round(v.minZ * 100)}–${Math.round(v.maxZ * 100)}`; }
function applySectionPlanes() {
  if (!state.viewer) return; const scene = state.viewer.scene; const b = sectionWorldBounds(); const names = ["clipPlane", "clipPlane2", "clipPlane3", "clipPlane4", "clipPlane5", "clipPlane6"];
  if (!state.section.enabled || !b) names.forEach((name) => { scene[name] = null; }); else { const planes = [new BABYLON.Plane(1, 0, 0, -b.minX), new BABYLON.Plane(-1, 0, 0, b.maxX), new BABYLON.Plane(0, 1, 0, -b.minY), new BABYLON.Plane(0, -1, 0, b.maxY), new BABYLON.Plane(0, 0, 1, -b.minZ), new BABYLON.Plane(0, 0, -1, b.maxZ)]; names.forEach((name, index) => { scene[name] = planes[index]; }); }
  updateSectionVisuals(b); updateSectionSliders(); els.sectionStatus.textContent = state.section.enabled ? "ON" : "OFF"; els.sectionStatus.classList.toggle("pass", state.section.enabled); els.sectionRangeSummary.textContent = state.section.enabled ? sectionSummary() : "Full model"; els.sectionReadout.textContent = state.section.enabled ? sectionSummary() : "Full model";
}
function createSectionVisuals() {
  const scene = state.viewer.scene; const b = state.viewer.modelBounds; const size = Math.max(b.size.length() * .028, .08); const handleMaterial = new BABYLON.StandardMaterial("section-handle-material", scene); handleMaterial.diffuseColor = new BABYLON.Color3(.25, .88, .8); handleMaterial.emissiveColor = new BABYLON.Color3(.08, .3, .26); const descriptors = [{ key: "minX", axis: new BABYLON.Vector3(1, 0, 0) }, { key: "maxX", axis: new BABYLON.Vector3(1, 0, 0) }, { key: "minY", axis: new BABYLON.Vector3(0, 1, 0) }, { key: "maxY", axis: new BABYLON.Vector3(0, 1, 0) }, { key: "minZ", axis: new BABYLON.Vector3(0, 0, 1) }, { key: "maxZ", axis: new BABYLON.Vector3(0, 0, 1) }];
  for (const descriptor of descriptors) { const handle = BABYLON.MeshBuilder.CreateBox(`section-handle-${descriptor.key}`, { size }, scene); handle.material = handleMaterial; handle.metadata = { sectionHandle: descriptor.key, helper: true }; handle.isPickable = true; handle.visibility = 0; const drag = new BABYLON.PointerDragBehavior({ dragAxis: descriptor.axis }); drag.useObjectOrientationForDragging = false; drag.onDragObservable.add(() => { const axis = descriptor.key.slice(-1).toUpperCase(); const min = b[`min${axis}`]; const max = b[`max${axis}`]; const normalized = Math.max(0, Math.min(1, (handle.position[axis.toLowerCase()] - min) / Math.max(max - min, .0001))); setSectionValue(descriptor.key, normalized); }); handle.addBehavior(drag); state.viewer.sectionHandles.set(descriptor.key, handle); }
  for (let index = 0; index < 12; index += 1) { const line = BABYLON.MeshBuilder.CreateLines(`section-box-line-${index}`, { points: [BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero()] }, scene); line.color = new BABYLON.Color3(.25, .88, .8); line.alpha = .65; line.metadata = { helper: true }; line.isPickable = false; state.viewer.sectionLines.push(line); }
  updateSectionVisuals(sectionWorldBounds());
}
function updateSectionVisuals(bounds) {
  if (!state.viewer?.modelBounds) return; const b = bounds || sectionWorldBounds(); const centerX = (b.minX + b.maxX) / 2; const centerY = (b.minY + b.maxY) / 2; const centerZ = (b.minZ + b.maxZ) / 2; const positions = { minX: new BABYLON.Vector3(b.minX, centerY, centerZ), maxX: new BABYLON.Vector3(b.maxX, centerY, centerZ), minY: new BABYLON.Vector3(centerX, b.minY, centerZ), maxY: new BABYLON.Vector3(centerX, b.maxY, centerZ), minZ: new BABYLON.Vector3(centerX, centerY, b.minZ), maxZ: new BABYLON.Vector3(centerX, centerY, b.maxZ) }; for (const [key, handle] of state.viewer.sectionHandles.entries()) { handle.position.copyFrom(positions[key]); handle.visibility = state.section.enabled ? 1 : 0; }
  const corners = [new BABYLON.Vector3(b.minX, b.minY, b.minZ), new BABYLON.Vector3(b.maxX, b.minY, b.minZ), new BABYLON.Vector3(b.maxX, b.maxY, b.minZ), new BABYLON.Vector3(b.minX, b.maxY, b.minZ), new BABYLON.Vector3(b.minX, b.minY, b.maxZ), new BABYLON.Vector3(b.maxX, b.minY, b.maxZ), new BABYLON.Vector3(b.maxX, b.maxY, b.maxZ), new BABYLON.Vector3(b.minX, b.maxY, b.maxZ)]; const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]; state.viewer.sectionLines.forEach((line, index) => { const [from, to] = pairs[index]; line.visibility = state.section.enabled ? 1 : 0; BABYLON.MeshBuilder.CreateLines(line.name, { points: [corners[from], corners[to]], instance: line }); });
}
function setSectionValue(key, value) { const values = state.section.values; const axis = key.slice(-1); const minKey = `min${axis}`; const maxKey = `max${axis}`; if (key.startsWith("min")) values[minKey] = Math.min(Number(value), values[maxKey] - .01); else values[maxKey] = Math.max(Number(value), values[minKey] + .01); state.section.enabled = true; applySectionPlanes(); }
function resetSection() { state.section.values = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }; state.section.enabled = false; applySectionPlanes(); }
function toggleSectionPanel(fromBottom = false) { if (fromBottom) { els.sectionPanel.dataset.open = "false"; return; } const opening = els.sectionPanel.dataset.open !== "true"; els.sectionPanel.dataset.open = String(opening); if (opening) { state.section.enabled = true; applySectionPlanes(); } else { state.section.enabled = false; applySectionPlanes(); } document.querySelectorAll('[data-action="toggle-section"]').forEach((button) => button.classList.toggle("active", state.section.enabled)); }

function setNavigationMode(mode) { const next = mode === "walk" ? "walk" : "orbit"; if (!state.viewer || next === state.navigationMode) return; const scene = state.viewer.scene; if (next === "walk") { const source = state.viewer.orbitCamera; source.getViewMatrix(); state.viewer.walkCamera.position.copyFrom(source.position); state.viewer.walkCamera.rotation.y = source.alpha + Math.PI / 2; state.viewer.walkCamera.rotation.x = source.beta - Math.PI / 2; state.viewer.orbitCamera.detachControl(); state.viewer.walkCamera.attachControl(state.viewer.canvas, true); scene.activeCamera = state.viewer.walkCamera; state.viewer.activeCamera = state.viewer.walkCamera; } else { const walk = state.viewer.walkCamera; const forward = walk.getForwardRay().direction; state.viewer.orbitCamera.setPosition(walk.position.clone()); state.viewer.orbitCamera.target.copyFrom(walk.position.add(forward.scale(Math.max(state.viewer.modelBounds?.size.length() * .12 || 5, 3)))); state.viewer.walkCamera.detachControl(); state.viewer.orbitCamera.attachControl(state.viewer.canvas, true); scene.activeCamera = state.viewer.orbitCamera; state.viewer.activeCamera = state.viewer.orbitCamera; } state.navigationMode = next; els.walkthroughHud.hidden = next !== "walk"; document.querySelectorAll("[data-nav-mode]").forEach((button) => button.classList.toggle("active", button.dataset.navMode === next)); els.viewportHint.textContent = next === "walk" ? "WASD / arrows move · drag look · Esc exit" : "Drag orbit · Shift drag pan · Scroll zoom"; showToast(next === "walk" ? "Walkthrough mode enabled" : "Orbit mode enabled"); }

function captureView() { const camera = state.viewer.orbitCamera; return { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.asArray(), projection: state.projection, viewMode: state.viewMode, section: JSON.parse(JSON.stringify(state.section)) }; }
function applySavedView(view) { if (!view || !state.viewer) return; setNavigationMode("orbit"); applyProjection(view.projection || "perspective"); state.section = view.section || state.section; if (state.section.enabled) applySectionPlanes(); else applySectionPlanes(); animateCameraTo({ alpha: view.alpha, beta: view.beta, radius: view.radius, target: BABYLON.Vector3.FromArray(view.target) }, 620); updateViewMode(view.viewMode || "perspective"); }
function loadSavedViews() { try { const raw = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || "[]"); state.savedViews = Array.isArray(raw) ? raw : []; } catch { state.savedViews = []; } renderSavedViews(); }
function renderSavedViews() { els.savedViewSelect.innerHTML = `<option value="">Choose a saved view</option>${state.savedViews.map((view, index) => `<option value="${index}">${escapeHtml(view.name)}</option>`).join("")}`; }
function normalizeSavedViewName(value) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 64); }
function savedViewNameKey(value) { return normalizeSavedViewName(value).toLocaleLowerCase(); }
function nextSavedViewName() { let index = state.savedViews.length + 1; while (state.savedViews.some((view) => savedViewNameKey(view.name) === `view ${index}`)) index += 1; return `View ${index}`; }
function setSavedViewNameError(message = "") { els.savedViewNameError.textContent = message; els.savedViewNameError.hidden = !message; els.savedViewName.toggleAttribute("aria-invalid", Boolean(message)); }
function updateSavedViewNameCount() { els.savedViewNameCount.textContent = `${els.savedViewName.value.length} / 64`; }
function savedViewFocusableElements() { return [...els.savedViewDialog.querySelectorAll("button:not([disabled]), input:not([disabled])")]; }
function openSavedViewDialog() {
  if (!state.viewer || !els.savedViewDialog) return;
  state.savedViewDialogOpen = true;
  state.savedViewPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  els.savedViewName.value = nextSavedViewName();
  setSavedViewNameError();
  updateSavedViewNameCount();
  els.savedViewDialog.hidden = false;
  window.requestAnimationFrame(() => { els.savedViewName.focus(); els.savedViewName.select(); });
}
function closeSavedViewDialog() {
  if (!state.savedViewDialogOpen) return;
  state.savedViewDialogOpen = false;
  els.savedViewDialog.hidden = true;
  setSavedViewNameError();
  const previousFocus = state.savedViewPreviousFocus;
  state.savedViewPreviousFocus = null;
  if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus();
}
function persistSavedViews(views) { try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views)); return true; } catch { return false; } }
function commitSavedView() {
  const name = normalizeSavedViewName(els.savedViewName.value);
  if (!name) { setSavedViewNameError("Enter a name for this view."); els.savedViewName.focus(); return false; }
  if (state.savedViews.some((view) => savedViewNameKey(view.name) === savedViewNameKey(name))) { setSavedViewNameError("That view name is already saved. Choose another name."); els.savedViewName.focus(); els.savedViewName.select(); return false; }
  const nextViews = [...state.savedViews, { name, ...captureView() }];
  if (!persistSavedViews(nextViews)) { setSavedViewNameError("This browser could not persist the view. Try again."); return false; }
  state.savedViews = nextViews;
  renderSavedViews();
  els.savedViewSelect.value = String(state.savedViews.length - 1);
  closeSavedViewDialog();
  showToast(`Saved view · ${name}`);
  return true;
}
function saveCurrentView() { if (!state.viewer) return; openSavedViewDialog(); }

function handleCameraAction(action) { if (!state.viewer) return; if (action === "frame-all" || action === "reset") { frameBounds(state.viewer.modelBounds, "perspective", true); setStatus("Camera framed to full model", "ready"); return; } if (action === "focus-selected") { const mesh = state.viewer.meshByStep.get(Number(state.selectedStep)); if (!mesh) { setStatus("Select a mapped element to focus it", ""); return; } focusMesh(mesh, true); setStatus(`Focused · #${state.selectedStep}`, "ready"); return; } if (action === "help") els.cameraHelp.hidden = !els.cameraHelp.hidden; }

function bindSceneInput() { const { scene, canvas } = state.viewer; scene.onPointerObservable.add((pointerInfo) => { const event = pointerInfo.event; if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN && event.button === 0) { if (state.viewer.cameraTransition?.observer) { scene.onBeforeRenderObservable.remove(state.viewer.cameraTransition.observer); state.viewer.cameraTransition = null; } state.viewer.pointerDown = { x: event.clientX, y: event.clientY, shift: event.shiftKey }; }
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) { const pick = pickMappedMesh(); updateHover(pick); canvas.style.cursor = pick ? "pointer" : state.measure.active ? "crosshair" : "grab"; }
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP && event.button === 0) { const start = state.viewer.pointerDown; state.viewer.pointerDown = null; if (!start) return; const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y); if (moved > 6 || start.shift || event.shiftKey) return; if (state.measure.active) { handleMeasurePoint(pickMeasurePoint()); return; } const picked = pickMappedMesh(); const stepId = picked ? stepForNode(picked) : null; if (Number.isInteger(stepId)) selectStep(stepId, "model"); }
  }); }

function setPanelOpen(panel, open) { panel.dataset.open = String(open); }
function toggleInspector(tab = null) { const open = els.inspectorPanel.dataset.open === "true"; if (tab) { setPanelOpen(els.inspectorPanel, true); switchTab(tab); return; } setPanelOpen(els.inspectorPanel, !open); }
function switchTab(tab) { document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab)); document.querySelectorAll("[data-tab-view]").forEach((view) => { const active = view.dataset.tabView === tab; view.hidden = !active; view.classList.toggle("active", active); }); }
function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
function copyText(value) { navigator.clipboard?.writeText(value).then(() => showToast("Copied to clipboard")).catch(() => showToast("Copy unavailable in this browser")); }

function populateSummary(index, bridge) { const stats = index.stats || {}; els.schema.textContent = `${index.schema || "IFC"} · USD`; els.nodeCount.textContent = `${formatNumber(index.nodes.length)}`; els.metricElements.textContent = formatNumber(stats.ifc_elements); els.metricPorts.textContent = formatNumber(stats.ifc_distribution_ports); els.metricEdges.textContent = formatNumber(stats.semantic_edges); els.metricIntegrity.textContent = stats.dangling_entity_references === 0 ? "0" : formatNumber(stats.dangling_entity_references); els.sourceHash.textContent = `SHA-256 ${String(index.source_sha256 || "").slice(0, 16)}…`; els.frameworkBadge.textContent = `${bridge?.framework?.working_scene || "OpenUSD"} / ${bridge?.framework?.browser_runtime || "Babylon.js"}`; const stage2State = index.stage2_state || index.stage2?.state || "prepared-dry-run-only"; const stageLabel = stage2State === "applied-hallway-coordination" ? "candidate hallway stage · handoff pending" : stage2State.replaceAll("-", " "); els.stage2State.textContent = stageLabel; }

function bindInterfaceControls() {
  els.search.addEventListener("input", (event) => { state.searchTerm = event.target.value; els.searchClear.hidden = !state.searchTerm; renderNodeList(); }); els.searchClear.addEventListener("click", () => { state.searchTerm = ""; els.search.value = ""; els.searchClear.hidden = true; renderNodeList(); els.search.focus(); });
  els.savedViewForm.addEventListener("submit", (event) => { event.preventDefault(); commitSavedView(); });
  els.savedViewName.addEventListener("input", () => { updateSavedViewNameCount(); if (!els.savedViewNameError.hidden) setSavedViewNameError(); });
  els.savedViewDialog.addEventListener("click", (event) => { if (event.target === els.savedViewDialog || event.target.closest("[data-saved-view-dismiss=\"true\"]")) closeSavedViewDialog(); });
  document.addEventListener("click", (event) => { const target = event.target.closest("button, a"); if (!target) return; const action = target.dataset.action; const cameraAction = target.dataset.cameraAction; const view = target.dataset.view; if (cameraAction) { event.preventDefault(); handleCameraAction(cameraAction); return; } if (action === "toggle-tools") { event.preventDefault(); setPanelOpen(els.toolsPanel, els.toolsPanel.dataset.open !== "true"); return; } if (action === "toggle-inspector") { event.preventDefault(); toggleInspector(); return; } if (action === "toggle-graph") { event.preventDefault(); toggleInspector("graph"); return; } if (action === "toggle-section") { event.preventDefault(); toggleSectionPanel(target.closest(".bottom-panel") !== null); return; } if (action === "section-reset") { event.preventDefault(); resetSection(); showToast("Section box reset"); return; } if (action === "toggle-measure") { event.preventDefault(); setMeasureActive(!state.measure.active); return; } if (action === "clear-measure") { event.preventDefault(); clearMeasure(); return; } if (action === "toggle-walk") { event.preventDefault(); setNavigationMode(state.navigationMode === "walk" ? "orbit" : "walk"); return; } if (action === "close-help") { els.cameraHelp.hidden = true; return; } if (action === "fullscreen") { toggleFullscreen(); return; } if (action === "toggle-projection") { applyProjection(state.projection === "perspective" ? "orthographic" : "perspective"); showToast(state.projection === "orthographic" ? "Orthographic projection" : "Perspective projection"); return; } if (action === "save-view") { saveCurrentView(); return; } if (action === "cancel-save-view") { closeSavedViewDialog(); return; } if (action === "load-view") { const view = state.savedViews[Number(els.savedViewSelect.value)]; if (view) applySavedView(view); return; } if (action === "delete-view") { const index = Number(els.savedViewSelect.value); if (Number.isInteger(index) && state.savedViews[index]) { state.savedViews.splice(index, 1); localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(state.savedViews)); renderSavedViews(); showToast("Saved view deleted"); } return; } if (action === "reset-filters") { state.filters = { discipline: "all", level: "all", system: "all" }; els.disciplineFilter.value = "all"; els.levelFilter.value = "all"; els.systemFilter.value = "all"; renderNodeList(); applyVisibility(); return; }
    const tab = target.dataset.tab; if (tab) { switchTab(tab); return; } if (view && state.viewer?.modelBounds) { frameBounds(state.viewer.modelBounds, view, true); setStatus(`${view === "perspective" ? "Isometric" : view[0].toUpperCase() + view.slice(1)} view`, "ready"); return; } const navMode = target.dataset.navMode; if (navMode) { setNavigationMode(navMode); return; } const visibilityMode = target.dataset.visibilityMode; if (visibilityMode) { state.visibilityMode = visibilityMode; document.querySelectorAll("[data-visibility-mode]").forEach((button) => button.classList.toggle("active", button.dataset.visibilityMode === visibilityMode)); applyVisibility(); return; } const visibilityAction = target.dataset.visibilityAction; if (visibilityAction === "isolate" && state.selectedStep !== null) { state.isolatedStep = state.selectedStep; applyVisibility(); showToast(`Isolated #${state.selectedStep}`); } else if (visibilityAction === "show-all") { state.isolatedStep = null; state.hiddenSteps.clear(); applyVisibility(); } else if (visibilityAction === "hide-selected" && state.selectedStep !== null) { state.hiddenSteps.add(state.selectedStep); applyVisibility(); showToast(`Hidden #${state.selectedStep}`); } else if (visibilityAction === "unhide-all") { state.hiddenSteps.clear(); applyVisibility(); } const copy = target.dataset.copy; if (copy) copyText(copy); });
  [els.disciplineFilter, els.levelFilter, els.systemFilter].forEach((select) => select.addEventListener("change", () => { state.filters[select.id.replace("-filter", "")] = select.value; renderNodeList(); applyVisibility(); }));
  document.querySelectorAll("[data-section-axis]").forEach((input) => input.addEventListener("input", () => setSectionValue(input.dataset.sectionAxis, Number(input.value))));
  const resizer = document.querySelector(".panel-resizer"); resizer.addEventListener("pointerdown", (event) => { event.preventDefault(); const startX = event.clientX; const startWidth = els.inspectorPanel.getBoundingClientRect().width; const move = (moveEvent) => { const next = Math.max(300, Math.min(560, startWidth + (startX - moveEvent.clientX))); document.documentElement.style.setProperty("--panel-width", `${next}px`); }; const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); });
  document.addEventListener("keydown", (event) => { if (state.savedViewDialogOpen) { if (event.key === "Escape") { event.preventDefault(); closeSavedViewDialog(); return; } if (event.key === "Tab") { const focusable = savedViewFocusableElements(); if (!focusable.length) return; const currentIndex = focusable.indexOf(document.activeElement); const nextIndex = event.shiftKey ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1) : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1); event.preventDefault(); focusable[nextIndex].focus(); return; } return; } const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName); if (event.key === "/" && !editing) { event.preventDefault(); switchTab("graph"); toggleInspector("graph"); els.search.focus(); return; } if (event.key === "Escape") { els.cameraHelp.hidden = true; if (state.navigationMode === "walk") { setNavigationMode("orbit"); return; } if (state.measure.active) { setMeasureActive(false); return; } if (els.sectionPanel.dataset.open === "true") { els.sectionPanel.dataset.open = "false"; return; } if (editing && state.searchTerm) { state.searchTerm = ""; els.search.value = ""; els.searchClear.hidden = true; renderNodeList(); return; } clearSelection(); return; } if (editing) return; const shortcut = event.key.toLowerCase(); if (shortcut === "f") handleCameraAction("frame-all"); if (shortcut === "h") handleCameraAction("focus-selected"); if (shortcut === "r") handleCameraAction("reset"); if (shortcut === "w") setNavigationMode(state.navigationMode === "walk" ? "orbit" : "walk"); if (shortcut === "o") { applyProjection(state.projection === "perspective" ? "orthographic" : "perspective"); showToast(state.projection === "orthographic" ? "Orthographic projection" : "Perspective projection"); } if (shortcut === "x") toggleSectionPanel(); if (shortcut === "m") setMeasureActive(!state.measure.active); if (shortcut === "t") setPanelOpen(els.toolsPanel, els.toolsPanel.dataset.open !== "true"); if (shortcut === "i") toggleInspector(); if (shortcut === "g") toggleInspector("graph"); if (shortcut === "1" && state.viewer?.modelBounds) frameBounds(state.viewer.modelBounds, "top", true); if (shortcut === "2" && state.viewer?.modelBounds) frameBounds(state.viewer.modelBounds, "front", true); if (shortcut === "3" && state.viewer?.modelBounds) frameBounds(state.viewer.modelBounds, "right", true); if (event.key === "?") handleCameraAction("help"); });
}

async function loadScene() { state.viewer = createBabylonViewer(); bindSceneInput(); setStatus("Loading high-fidelity scene payload", ""); els.viewerMessage.textContent = "Loading the coordination scene…"; const geometryUrl = state.index.geometry_url || DEFAULT_GEOMETRY_URL; const { root, file } = splitAssetUrl(geometryUrl); const result = await BABYLON.SceneLoader.ImportMeshAsync(null, root, file, state.viewer.scene, (progress) => { if (progress?.lengthComputable) setStatus(`Loading scene · ${Math.round((progress.loaded / progress.total) * 100)}%`, ""); }); const importedMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices?.() > 0); state.viewer.modelRoot = new BABYLON.TransformNode("bim-model-root", state.viewer.scene); importedMeshes.forEach((mesh) => { if (!mesh.parent) mesh.parent = state.viewer.modelRoot; }); const rawBounds = boundsForMeshes(importedMeshes); state.viewer.modelRoot.position = rawBounds.center.scale(-1); importedMeshes.forEach((mesh) => mesh.computeWorldMatrix(true)); const centeredBounds = boundsForMeshes(importedMeshes); state.viewer.modelBounds = centeredBounds; registerSceneNodes(importedMeshes); addPresentationContext(centeredBounds); createSectionVisuals(); state.viewer.orbitCamera.lowerRadiusLimit = Math.max(Math.max(centeredBounds.size.x, centeredBounds.size.y, centeredBounds.size.z) * .006, .05); state.viewer.orbitCamera.upperRadiusLimit = Math.max(centeredBounds.size.length() * 30, 1000); state.viewer.orbitCamera.minZ = .01; state.viewer.orbitCamera.maxZ = Math.max(centeredBounds.size.length() * 40, 1000); frameBounds(centeredBounds, "perspective", false); applyVisibility(); els.viewerLoading.classList.add("ready"); setStatus(`Model ready · ${formatNumber(state.viewer.meshByStep.size)} mapped elements · candidate handoff pending`, "ready"); els.viewerMessage.textContent = "Click an element to inspect its IFC identity."; }

async function init() { try { const response = await fetch(DATA_URL); if (!response.ok) throw new Error(`Knowledge graph index returned ${response.status}`); state.index = await response.json(); const bridgeUrl = state.index.scene_bridge_index_url || state.index.scene_bridge_url; if (bridgeUrl) { const bridgeResponse = await fetch(bridgeUrl); if (!bridgeResponse.ok) throw new Error(`Scene bridge returned ${bridgeResponse.status}`); state.bridge = await bridgeResponse.json(); state.coordinateFrame = state.bridge.coordinate_frame || null; (state.bridge.products || []).forEach((product) => state.bridgeByStep.set(Number(product.ifc_step_id), product)); } state.allNodes = state.index.nodes || []; state.edgeByIndex = state.index.edges || []; state.allNodes.forEach((node) => state.nodeByStep.set(Number(node.step_id), node)); buildSystemMembership(); populateFilters(); populateSummary(state.index, state.bridge); renderNodeList(); loadSavedViews(); bindInterfaceControls(); await loadScene(); } catch (error) { console.error(error); setStatus("Model load failed", "error"); els.viewerMessage.textContent = "The linked scene payload could not load."; } }

init();
