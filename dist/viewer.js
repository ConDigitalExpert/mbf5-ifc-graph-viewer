/* global BABYLON */

const DATA_URL = "./data/viewer_index.json";
const DEFAULT_GEOMETRY_URL = "./data/MBF5-TEST-COORDINATION.scene.glb";

const els = {
  schema: document.querySelector("#schema-badge"),
  status: document.querySelector("#load-status"),
  viewer: document.querySelector("#viewer-container"),
  viewerLoading: document.querySelector(".viewer-loading"),
  viewerMessage: document.querySelector("#viewer-message"),
  search: document.querySelector("#node-search"),
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
  searchTerm: "",
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function setStatus(message, mode = "") {
  els.status.className = `status-line ${mode}`.trim();
  els.status.innerHTML = `<i class="status-dot"></i>${message}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nodeLabel(node) {
  return node?.name || node?.object_type || `${node?.entity_type || "IFC node"} #${node?.step_id ?? "?"}`;
}

function nodeForStep(stepId) {
  return state.nodeByStep.get(Number(stepId)) || {
    step_id: Number(stepId),
    entity_type: "Referenced IFC node",
    name: `STEP #${stepId}`,
    global_id: null,
  };
}

function bridgeForStep(stepId) {
  return state.bridgeByStep.get(Number(stepId)) || null;
}

function searchableText(node) {
  return [node.name, node.global_id, node.entity_type, node.object_type, node.tag, node.step_id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderNodeList() {
  const query = state.searchTerm.trim().toLowerCase();
  const matched = query ? state.allNodes.filter((node) => searchableText(node).includes(query)) : state.allNodes;
  const visible = matched.slice(0, 260);
  els.listCount.textContent = `${formatNumber(matched.length)} match${matched.length === 1 ? "" : "es"}`;
  els.listCaption.textContent = query ? "Search results" : "Graph nodes with model identity";
  els.nodeList.innerHTML = visible.length
    ? visible.map((node) => `
      <button class="node-row ${state.selectedStep === node.step_id ? "selected" : ""}" data-step="${node.step_id}" role="option" aria-selected="${state.selectedStep === node.step_id}">
        <span class="node-pip"></span>
        <span class="node-main">
          <span class="node-title">${escapeHtml(nodeLabel(node))}</span>
          <span class="node-meta"><span>${escapeHtml(node.entity_type)}</span>${node.global_id ? `<span>${escapeHtml(node.global_id)}</span>` : ""}</span>
        </span>
        <span class="node-step">#${node.step_id}</span>
      </button>`).join("")
    : `<div class="list-empty">No graph nodes match “${escapeHtml(query)}”. Try a GlobalId, element class, or STEP number.</div>`;
  if (matched.length > visible.length) {
    els.nodeList.insertAdjacentHTML("beforeend", `<div class="list-empty">Showing the first ${formatNumber(visible.length)} results. Refine the search to narrow the list.</div>`);
  }
  els.nodeList.querySelectorAll(".node-row").forEach((button) => {
    button.addEventListener("click", () => selectStep(Number(button.dataset.step), "graph"));
  });
}

function edgeIndexesFor(stepId) {
  const indexes = state.index.edge_index_by_node[String(stepId)] || [];
  return indexes.map((index) => state.edgeByIndex[index]).filter(Boolean);
}

function renderRelationships(stepId) {
  const edges = edgeIndexesFor(stepId);
  if (!edges.length) return `<p class="relationship-source">No explicit semantic relationship edges are attached to this node.</p>`;
  return `<div class="relationship-list">${edges.slice(0, 80).map((edge) => {
    const outgoing = edge.source_step_id === stepId;
    const otherStep = outgoing ? edge.target_step_id : edge.source_step_id;
    const other = nodeForStep(otherStep);
    const arrow = outgoing ? "→" : "←";
    return `<div class="relationship-row">
      <span class="relationship-direction" aria-hidden="true">${arrow}</span>
      <button class="relationship-node" data-step="${otherStep}">
        <strong>${escapeHtml(nodeLabel(other))}</strong>
        <span>${escapeHtml(other.entity_type)} · #${otherStep}</span>
      </button>
      <span class="relationship-predicate" title="${escapeHtml(edge.predicate)}">${escapeHtml(edge.predicate)}</span>
    </div>`;
  }).join("")}</div>${edges.length > 80 ? `<p class="relationship-source">Showing 80 of ${formatNumber(edges.length)} explicit edges.</p>` : ""}`;
}

function renderDetail(stepId, source) {
  const node = nodeForStep(stepId);
  const bridge = bridgeForStep(stepId);
  const globalId = node.global_id || bridge?.ifc_global_id || null;
  const name = node.name || node.object_type || nodeLabel(node);
  const objectType = node.object_type || null;
  const tag = node.tag || null;
  const edges = edgeIndexesFor(stepId);
  const mesh = state.viewer?.meshByStep.get(Number(stepId));
  const geometry = bridge?.geometry;
  const origin = state.coordinateFrame?.model_origin_m;
  const originLabel = Array.isArray(origin) ? origin.map((value) => Number(value).toFixed(4)).join(", ") : "not declared";
  els.detail.className = "selection-detail";
  els.detail.innerHTML = `
    <div class="detail-head">
      <div><h3 class="detail-title">${escapeHtml(name)}</h3><div class="detail-type">${escapeHtml(node.entity_type)}</div></div>
      <span class="detail-step">#${stepId}</span>
    </div>
    <div class="detail-id"><span>GlobalId</span><code>${escapeHtml(globalId || "not assigned")}</code></div>
    <div class="detail-tags">
      ${objectType ? `<span class="tag accent">${escapeHtml(objectType)}</span>` : ""}
      ${tag ? `<span class="tag">Tag ${escapeHtml(tag)}</span>` : ""}
      <span class="tag">${source === "model" ? "picked in 3D" : "picked in graph"}</span>
    </div>
    <div class="detail-section-label">Identity bridge</div>
    <div class="property-line"><span>IFC STEP id</span><strong>#${stepId}</strong></div>
    <div class="property-line"><span>Display geometry</span><strong>${mesh ? "linked glTF node" : geometry?.represented ? "mapped, not loaded" : "no preview mesh"}</strong></div>
    <div class="property-line"><span>OpenUSD prim</span><strong>${escapeHtml(geometry?.usd_prim_path || "none")}</strong></div>
    <div class="property-line"><span>Scene geometry id</span><strong>${escapeHtml(geometry?.geometry_id || "none")}</strong></div>
    <div class="property-line"><span>Scene coordinate frame</span><strong>local + [${escapeHtml(originLabel)}] m</strong></div>
    <div class="property-line"><span>Property source</span><strong>Full IFC graph</strong></div>
    <div class="property-line"><span>Stage 2 writeback</span><strong>IFC-native, dry-run prepared</strong></div>
    <div class="detail-section-label">Explicit graph interfaces · ${formatNumber(edges.length)}</div>
    ${renderRelationships(stepId)}
  `;
  els.detail.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => selectStep(Number(button.dataset.step), "graph"));
  });
}

function setMeshHighlight(mesh, selected) {
  if (!mesh) return;
  mesh.renderOutline = selected;
  mesh.outlineColor = new BABYLON.Color3(0.96, 0.73, 0.25);
  mesh.outlineWidth = 0.025;
  mesh.showSubMeshesBoundingBox = false;
}

function clearHighlight() {
  const previous = state.viewer?.selectedMesh;
  if (previous) setMeshHighlight(previous, false);
  if (state.viewer) state.viewer.selectedMesh = null;
}

function parseStepId(name) {
  const match = String(name || "").match(/(?:^|-)id-(\d+)(?:$|-)/);
  return match ? Number(match[1]) : null;
}

function stepForNode(node) {
  let current = node;
  while (current) {
    if (Number.isInteger(current.metadata?.ifc_step_id)) return current.metadata.ifc_step_id;
    const parsed = parseStepId(current.name);
    if (parsed !== null) return parsed;
    current = current.parent;
  }
  return null;
}

function splitAssetUrl(url) {
  const clean = String(url || "").split("?")[0];
  const slash = clean.lastIndexOf("/");
  return { root: slash >= 0 ? `${clean.slice(0, slash + 1)}` : "./", file: clean.slice(slash + 1) };
}

function boundsForMeshes(meshes) {
  const min = new BABYLON.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new BABYLON.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  let count = 0;
  for (const mesh of meshes) {
    if (!mesh.getBoundingInfo || mesh.getTotalVertices?.() === 0) continue;
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
    count += 1;
  }
  if (!count) throw new Error("Scene contains no renderable mapped meshes");
  return { min, max, center: min.add(max).scale(0.5), size: max.subtract(min) };
}

function createBabylonViewer() {
  const canvas = document.createElement("canvas");
  canvas.className = "model-canvas";
  canvas.setAttribute("aria-label", "OpenUSD-backed BIM scene rendered as glTF");
  els.viewer.insertBefore(canvas, els.viewer.firstChild);
  const engine = new BABYLON.Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: false });
  engine.setHardwareScalingLevel(Math.min(1.35, 1 / Math.min(window.devicePixelRatio || 1, 2)));
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.028, 0.047, 0.06, 1);
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.08;
  scene.imageProcessingConfiguration.contrast = 1.12;

  const camera = new BABYLON.ArcRotateCamera("bim-camera", -Math.PI / 2.35, Math.PI / 2.95, 50, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.panningSensibility = 65;
  camera.wheelPrecision = 55;
  camera.lowerRadiusLimit = 0.1;
  camera.upperRadiusLimit = 100000;
  camera.useBouncingBehavior = true;
  camera.useAutoRotationBehavior = false;

  const hemispheric = new BABYLON.HemisphericLight("bim-fill", new BABYLON.Vector3(0.15, 1, 0.25), scene);
  hemispheric.intensity = 1.35;
  hemispheric.diffuse = new BABYLON.Color3(0.82, 0.9, 1.0);
  hemispheric.groundColor = new BABYLON.Color3(0.08, 0.14, 0.17);
  const key = new BABYLON.DirectionalLight("bim-key", new BABYLON.Vector3(-0.45, -1, 0.55), scene);
  key.position = new BABYLON.Vector3(160, 220, 100);
  key.intensity = 2.1;
  const rim = new BABYLON.DirectionalLight("bim-rim", new BABYLON.Vector3(0.55, -0.35, -0.75), scene);
  rim.position = new BABYLON.Vector3(-120, 120, -180);
  rim.diffuse = new BABYLON.Color3(0.24, 0.7, 0.68);
  rim.intensity = 0.8;

  const pipeline = new BABYLON.DefaultRenderingPipeline("bim-rendering", true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.samples = 4;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.18;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.95;
  pipeline.bloomWeight = 0.06;
  pipeline.bloomKernel = 32;

  const viewer = {
    canvas,
    engine,
    scene,
    camera,
    modelRoot: null,
    meshByStep: new Map(),
    selectedMesh: null,
    shadowGenerator: null,
    resizeObserver: null,
  };
  const resize = () => engine.resize();
  viewer.resizeObserver = new ResizeObserver(resize);
  viewer.resizeObserver.observe(els.viewer);
  engine.runRenderLoop(() => scene.render());
  return viewer;
}

function registerSceneNodes(nodes) {
  for (const node of nodes) {
    const stepId = stepForNode(node);
    if (!Number.isInteger(stepId)) continue;
    node.metadata = { ...(node.metadata || {}), ifc_step_id: stepId };
    if (!state.viewer.meshByStep.has(stepId) && node.getTotalVertices?.() > 0) {
      state.viewer.meshByStep.set(stepId, node);
    }
    if (node.material && node.material.albedoColor) {
      node.material.roughness = Math.min(Math.max(Number(node.material.roughness || 0.42), 0.28), 0.82);
    }
    node.receiveShadows = true;
  }
}

function addPresentationContext(bounds) {
  const maxDim = Math.max(bounds.size.x, bounds.size.y, bounds.size.z, 1);
  const gridSize = Math.max(maxDim * 1.55, 10);
  const ground = BABYLON.MeshBuilder.CreateGround("presentation-ground", { width: gridSize, height: gridSize, subdivisions: 2 }, state.viewer.scene);
  ground.position.y = bounds.min.y - maxDim * 0.02;
  const groundMaterial = new BABYLON.PBRMaterial("presentation-ground-material", state.viewer.scene);
  groundMaterial.albedoColor = new BABYLON.Color3(0.045, 0.075, 0.085);
  groundMaterial.roughness = 0.85;
  groundMaterial.metallic = 0.02;
  ground.material = groundMaterial;
  ground.receiveShadows = true;
  const axes = new BABYLON.AxesViewer(state.viewer.scene, Math.max(maxDim * 0.18, 1));
  axes.xAxis.parent = state.viewer.modelRoot;
  axes.yAxis.parent = state.viewer.modelRoot;
  axes.zAxis.parent = state.viewer.modelRoot;
  state.viewer.shadowGenerator = new BABYLON.ShadowGenerator(2048, state.viewer.scene.getLightByName("bim-key"));
  state.viewer.shadowGenerator.usePercentageCloserFiltering = true;
  state.viewer.shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
  for (const mesh of state.viewer.meshByStep.values()) {
    state.viewer.shadowGenerator.addShadowCaster(mesh, true);
  }
}

function fitScene(bounds) {
  const maxDim = Math.max(bounds.size.x, bounds.size.y, bounds.size.z, 1);
  state.viewer.camera.target.copyFrom(bounds.center);
  state.viewer.camera.radius = maxDim * 1.42;
  state.viewer.camera.lowerRadiusLimit = Math.max(maxDim * 0.006, 0.05);
  state.viewer.camera.upperRadiusLimit = maxDim * 30;
  state.viewer.camera.minZ = Math.max(maxDim / 100000, 0.01);
  state.viewer.camera.maxZ = Math.max(maxDim * 40, 1000);
}

function focusMesh(mesh) {
  if (!mesh) return;
  mesh.computeWorldMatrix(true);
  const box = mesh.getBoundingInfo().boundingBox;
  const size = box.extendSizeWorld.scale(2);
  const distance = Math.max(size.length() * 2.2, 1);
  state.viewer.camera.target.copyFrom(box.centerWorld);
  state.viewer.camera.radius = distance;
}

function highlightModel(stepId, focus = false) {
  if (!state.viewer) return;
  clearHighlight();
  const mesh = state.viewer.meshByStep.get(Number(stepId));
  if (!mesh) {
    setStatus(`Graph node selected · #${stepId}`, "");
    return;
  }
  setMeshHighlight(mesh, true);
  state.viewer.selectedMesh = mesh;
  if (focus) focusMesh(mesh);
  setStatus(`Selected · #${stepId}`, "ready");
}

async function selectStep(stepId, source = "graph") {
  state.selectedStep = Number(stepId);
  renderNodeList();
  highlightModel(state.selectedStep, source === "graph");
  renderDetail(state.selectedStep, source);
  els.detail.scrollTop = 0;
}

function pickModelItem() {
  if (!state.viewer?.scene) return;
  const pick = state.viewer.scene.pick(state.viewer.scene.pointerX, state.viewer.scene.pointerY, (mesh) => stepForNode(mesh) !== null);
  const stepId = pick?.hit ? stepForNode(pick.pickedMesh) : null;
  if (Number.isInteger(stepId)) selectStep(stepId, "model");
}

function populateSummary(index, bridge) {
  const stats = index.stats || {};
  els.schema.textContent = `${index.schema || "IFC"} · USD`;
  els.nodeCount.textContent = `${formatNumber(index.nodes.length)} indexed`;
  els.metricElements.textContent = formatNumber(stats.ifc_elements);
  els.metricPorts.textContent = formatNumber(stats.ifc_distribution_ports);
  els.metricEdges.textContent = formatNumber(stats.semantic_edges);
  els.metricIntegrity.textContent = stats.dangling_entity_references === 0 ? "0" : formatNumber(stats.dangling_entity_references);
  els.sourceHash.textContent = `SHA-256 ${String(index.source_sha256 || "").slice(0, 16)}…`;
  els.frameworkBadge.textContent = `${bridge?.framework?.working_scene || "OpenUSD"} / ${bridge?.framework?.browser_runtime || "Babylon.js"}`;
  els.stage2State.textContent = "Stage 2 prepared · dry-run only";
}

async function loadScene() {
  state.viewer = createBabylonViewer();
  els.viewer.addEventListener("dblclick", pickModelItem);
  setStatus("Loading premium scene payload", "");
  els.viewerMessage.textContent = "Loading OpenUSD-backed scene geometry…";
  const geometryUrl = state.index.geometry_url || DEFAULT_GEOMETRY_URL;
  const { root, file } = splitAssetUrl(geometryUrl);
  const result = await BABYLON.SceneLoader.ImportMeshAsync(null, root, file, state.viewer.scene);
  const importedMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices?.() > 0);
  state.viewer.modelRoot = new BABYLON.TransformNode("bim-model-root", state.viewer.scene);
  for (const mesh of importedMeshes) {
    if (!mesh.parent) mesh.parent = state.viewer.modelRoot;
  }
  const bounds = boundsForMeshes(importedMeshes);
  state.viewer.modelRoot.position = bounds.center.scale(-1);
  for (const mesh of importedMeshes) mesh.computeWorldMatrix(true);
  const centeredBounds = boundsForMeshes(importedMeshes);
  registerSceneNodes(importedMeshes);
  addPresentationContext(centeredBounds);
  fitScene(centeredBounds);
  els.viewerLoading.classList.add("ready");
  setStatus(`Model ready · ${formatNumber(state.viewer.meshByStep.size)} mapped meshes · local frame`, "ready");
  els.viewerMessage.textContent = "Double click an element to select it in the graph.";
}

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Knowledge graph index returned ${response.status}`);
    state.index = await response.json();
    const bridgeUrl = state.index.scene_bridge_index_url || state.index.scene_bridge_url;
    if (bridgeUrl) {
      const bridgeResponse = await fetch(bridgeUrl);
      if (!bridgeResponse.ok) throw new Error(`Scene bridge returned ${bridgeResponse.status}`);
      state.bridge = await bridgeResponse.json();
      state.coordinateFrame = state.bridge.coordinate_frame || null;
      (state.bridge.products || []).forEach((product) => state.bridgeByStep.set(Number(product.ifc_step_id), product));
    }
    state.allNodes = state.index.nodes;
    state.edgeByIndex = state.index.edges;
    state.allNodes.forEach((node) => state.nodeByStep.set(Number(node.step_id), node));
    populateSummary(state.index, state.bridge);
    renderNodeList();
    els.search.addEventListener("input", (event) => {
      state.searchTerm = event.target.value;
      renderNodeList();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== els.search) {
        event.preventDefault();
        els.search.focus();
      }
    });
    await loadScene();
  } catch (error) {
    console.error(error);
    setStatus("Model load failed", "error");
    els.viewerMessage.textContent = "The OpenUSD-backed scene payload could not load.";
  }
}

init();
