import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const DATA_URL = "./data/viewer_index.json";
const DEFAULT_GEOMETRY_URL = "./data/MBF5-TEST-COORDINATION.glb";

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
};

const state = {
  index: null,
  viewer: null,
  selectedStep: null,
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
  const globalId = node.global_id || null;
  const name = node.name || node.object_type || nodeLabel(node);
  const objectType = node.object_type || null;
  const tag = node.tag || null;
  const edges = edgeIndexesFor(stepId);
  const mesh = state.viewer?.meshByStep.get(Number(stepId));
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
    <div class="property-line"><span>Display geometry</span><strong>${mesh ? "linked glTF mesh" : "no preview mesh"}</strong></div>
    <div class="property-line"><span>Source graph</span><strong>Phase 1 index</strong></div>
    <div class="detail-section-label">Explicit graph interfaces · ${formatNumber(edges.length)}</div>
    ${renderRelationships(stepId)}
  `;
  els.detail.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => selectStep(Number(button.dataset.step), "graph"));
  });
}

function materialList(object) {
  return Array.isArray(object.material) ? object.material : [object.material];
}

function setObjectHighlight(object, selected) {
  if (!object) return;
  for (const material of materialList(object)) {
    if (!material) continue;
    if (!material.userData.phase1BaseColor && material.color) {
      material.userData.phase1BaseColor = material.color.clone();
      material.userData.phase1BaseEmissive = material.emissive?.clone?.() || null;
      material.userData.phase1BaseEmissiveIntensity = material.emissiveIntensity;
    }
    if (selected) {
      material.color?.set(0xf5b942);
      material.emissive?.set(0x6a3e00);
      if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0.8;
    } else {
      material.userData.phase1BaseColor && material.color?.copy(material.userData.phase1BaseColor);
      material.userData.phase1BaseEmissive && material.emissive?.copy(material.userData.phase1BaseEmissive);
      if (material.emissiveIntensity !== undefined) material.emissiveIntensity = material.userData.phase1BaseEmissiveIntensity || 0;
    }
    material.needsUpdate = true;
  }
}

function clearHighlight() {
  const previous = state.viewer?.selectedObject;
  if (previous) setObjectHighlight(previous, false);
  if (state.viewer) state.viewer.selectedObject = null;
}

function parseStepId(name) {
  const match = String(name || "").match(/(?:^|-)id-(\d+)(?:$|-)/);
  return match ? Number(match[1]) : null;
}

function stepForObject(object) {
  let current = object;
  while (current) {
    if (Number.isInteger(current.userData?.stepId)) return current.userData.stepId;
    const parsed = parseStepId(current.name);
    if (parsed !== null) return parsed;
    current = current.parent;
  }
  return null;
}

function createThreeViewer() {
  const width = Math.max(1, els.viewer.clientWidth);
  const height = Math.max(1, els.viewer.clientHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e171e);
  scene.add(new THREE.HemisphereLight(0xdde9ff, 0x1b3039, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(80, 120, 70);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x70b9b2, 1.2);
  fillLight.position.set(-80, 50, -90);
  scene.add(fillLight);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = "model-canvas";
  renderer.domElement.setAttribute("aria-label", "Rendered IFC display geometry");
  els.viewer.insertBefore(renderer.domElement, els.viewer.firstChild);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 10000);
  camera.position.set(35, 25, 35);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.05;

  const viewer = {
    scene,
    renderer,
    camera,
    controls,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    root: null,
    meshByStep: new Map(),
    selectedObject: null,
    resizeObserver: null,
  };

  const resize = () => {
    const nextWidth = Math.max(1, els.viewer.clientWidth);
    const nextHeight = Math.max(1, els.viewer.clientHeight);
    renderer.setSize(nextWidth, nextHeight, false);
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
  };
  viewer.resizeObserver = new ResizeObserver(resize);
  viewer.resizeObserver.observe(els.viewer);

  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
  return viewer;
}

function fitScene(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error("Derived geometry contains no renderable bounds");
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const centeredBounds = new THREE.Box3().setFromObject(root);
  const size = centeredBounds.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const gridSize = Math.max(maxDim * 1.55, 10);
  const divisions = Math.min(40, Math.max(10, Math.round(gridSize / Math.max(maxDim / 10, 1))));
  const grid = new THREE.GridHelper(gridSize, divisions, 0x36515a, 0x20333d);
  grid.position.y = centeredBounds.min.y - maxDim * 0.018;
  state.viewer.scene.add(grid);
  const axes = new THREE.AxesHelper(Math.max(maxDim * 0.18, 1));
  axes.position.set(centeredBounds.min.x, grid.position.y, centeredBounds.min.z);
  state.viewer.scene.add(axes);

  const distance = maxDim * 1.45;
  state.viewer.camera.position.set(distance, distance * 0.78, distance);
  state.viewer.camera.near = Math.max(maxDim / 100000, 0.01);
  state.viewer.camera.far = Math.max(maxDim * 25, 1000);
  state.viewer.camera.updateProjectionMatrix();
  state.viewer.controls.target.set(0, 0, 0);
  state.viewer.controls.update();
}

function registerMeshes(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const stepId = stepForObject(object);
    if (!Number.isInteger(stepId)) return;
    object.userData.stepId = stepId;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    state.viewer.meshByStep.set(stepId, object);
  });
}

function focusObject(object) {
  if (!object) return;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.length() * 2.2, 3);
  const direction = state.viewer.camera.position.clone().sub(state.viewer.controls.target).normalize();
  state.viewer.camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
  state.viewer.controls.target.copy(center);
  state.viewer.controls.update();
}

function highlightModel(stepId, focus = false) {
  if (!state.viewer) return;
  clearHighlight();
  const object = state.viewer.meshByStep.get(Number(stepId));
  if (!object) {
    setStatus(`Graph node selected · #${stepId}`, "");
    return;
  }
  setObjectHighlight(object, true);
  state.viewer.selectedObject = object;
  if (focus) focusObject(object);
  setStatus(`Selected · #${stepId}`, "ready");
}

async function selectStep(stepId, source = "graph") {
  state.selectedStep = Number(stepId);
  renderNodeList();
  highlightModel(state.selectedStep, source === "graph");
  renderDetail(state.selectedStep, source);
  els.detail.scrollTop = 0;
}

function pickModelItem(event) {
  if (!state.viewer?.root) return;
  const rect = els.viewer.getBoundingClientRect();
  state.viewer.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.viewer.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.viewer.raycaster.setFromCamera(state.viewer.pointer, state.viewer.camera);
  const hits = state.viewer.raycaster.intersectObject(state.viewer.root, true);
  const hit = hits.find((candidate) => stepForObject(candidate.object) !== null);
  const stepId = hit ? stepForObject(hit.object) : null;
  if (Number.isInteger(stepId)) selectStep(stepId, "model");
}

function populateSummary(index) {
  const stats = index.stats || {};
  els.schema.textContent = index.schema || "IFC";
  els.nodeCount.textContent = `${formatNumber(index.nodes.length)} indexed`;
  els.metricElements.textContent = formatNumber(stats.ifc_elements);
  els.metricPorts.textContent = formatNumber(stats.ifc_distribution_ports);
  els.metricEdges.textContent = formatNumber(stats.semantic_edges);
  els.metricIntegrity.textContent = stats.dangling_entity_references === 0 ? "0" : formatNumber(stats.dangling_entity_references);
  els.sourceHash.textContent = `SHA-256 ${String(index.source_sha256 || "").slice(0, 16)}…`;
}

async function loadModel() {
  state.viewer = createThreeViewer();
  els.viewer.addEventListener("dblclick", pickModelItem);
  setStatus("Loading display geometry", "");
  els.viewerMessage.textContent = "Loading derived IFC display geometry…";
  const geometryUrl = state.index.geometry_url || DEFAULT_GEOMETRY_URL;
  const loader = new GLTFLoader();
  await new Promise((resolve, reject) => {
    loader.load(
      geometryUrl,
      (gltf) => {
        state.viewer.root = gltf.scene;
        state.viewer.scene.add(gltf.scene);
        registerMeshes(gltf.scene);
        fitScene(gltf.scene);
        resolve();
      },
      (progress) => {
        if (progress.total) setStatus(`Loading display geometry · ${Math.round((progress.loaded / progress.total) * 100)}%`, "");
      },
      reject,
    );
  });
  els.viewerLoading.classList.add("ready");
  setStatus(`Model ready · ${formatNumber(state.viewer.meshByStep.size)} meshes`, "ready");
  els.viewerMessage.textContent = "Double click an element to select it in the graph.";
}

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Knowledge graph index returned ${response.status}`);
    state.index = await response.json();
    state.allNodes = state.index.nodes;
    state.edgeByIndex = state.index.edges;
    state.allNodes.forEach((node) => state.nodeByStep.set(Number(node.step_id), node));
    populateSummary(state.index);
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
    await loadModel();
  } catch (error) {
    console.error(error);
    setStatus("Model load failed", "error");
    els.viewerMessage.textContent = "The derived IFC display geometry could not load.";
  }
}

init();
