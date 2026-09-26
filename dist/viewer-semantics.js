/** Deterministic interpretation of the published IFC graph and placement evidence. */

const UNASSIGNED = "UNASSIGNED";
const SHA256 = /^[a-f0-9]{64}$/;
const finiteVector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/**
 * Resolve storeys through IFC relationships, never element-name guesses.
 * Same-named storeys remain distinct in provenance, but share a filter label.
 * Direct containment/decomposition takes precedence over host-derived membership.
 */
export function buildLevelMembership(nodes = [], edges = []) {
  const byStep = new Map(nodes.map((node) => [Number(node.step_id), node]));
  const parents = new Map();
  function add(child, parent, edge, hostDerived = false) {
    child = Number(child); parent = Number(parent);
    if (!byStep.has(child) || !byStep.has(parent)) return;
    if (!parents.has(child)) parents.set(child, []);
    parents.get(child).push({ parent, edge, hostDerived });
  }
  for (const edge of edges) {
    const source = edge.source_step_id; const target = edge.target_step_id;
    if (edge.predicate === "contained_in" && edge.relationship_type === "IfcRelContainedInSpatialStructure") add(source, target, edge);
    else if (edge.predicate === "aggregates" && edge.relationship_type === "IfcRelAggregates") add(target, source, edge);
    else if (edge.predicate === "nests" && edge.relationship_type === "IfcRelNests") add(target, source, edge);
    else if (edge.predicate === "port_serves_element" && edge.relationship_type === "IfcRelConnectsPortToElement" && byStep.get(Number(source))?.entity_type === "IfcDistributionPort") add(source, target, edge, true);
    else if (edge.predicate === "covering_of_element" && edge.relationship_type === "IfcRelCoversBldgElements") add(source, target, edge, true);
    else if (edge.predicate === "has_opening" && edge.relationship_type === "IfcRelVoidsElement") add(target, source, edge, true);
    else if (edge.predicate === "filled_by" && edge.relationship_type === "IfcRelFillsElement") add(target, source, edge, true);
  }
  // Stable traversal gives reproducible paths when multiple IFC routes exist.
  for (const links of parents.values()) links.sort((a, b) => Number(a.hostDerived) - Number(b.hostDerived) || a.parent - b.parent || Number(a.edge.relationship_step_id) - Number(b.edge.relationship_step_id));
  function search(step, includeHosts) {
    const queue = [{ step, path: [] }]; const visited = new Set(); const found = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (visited.has(current.step)) continue;
      visited.add(current.step);
      const node = byStep.get(current.step);
      if (node?.entity_type === "IfcBuildingStorey") {
        found.push({ step_id: current.step, global_id: node.global_id || null, name: String(node.name || `Storey #${current.step}`).trim() || `Storey #${current.step}`, path: current.path });
        continue;
      }
      for (const link of parents.get(current.step) || []) {
        if (!includeHosts && link.hostDerived) continue;
        queue.push({ step: link.parent, path: [...current.path, { from_step_id: current.step, to_step_id: link.parent, relationship_step_id: link.edge.relationship_step_id, relationship_type: link.edge.relationship_type, predicate: link.edge.predicate, host_derived: link.hostDerived }] });
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name) || a.step_id - b.step_id);
  }
  const membership = new Map(); const labels = new Set();
  for (const step of byStep.keys()) {
    let storeys = search(step, false);
    if (!storeys.length) storeys = search(step, true);
    const levels = [...new Set(storeys.map((storey) => storey.name))].sort();
    if (!levels.length) levels.push(UNASSIGNED);
    levels.forEach((label) => labels.add(label));
    const provenance = !storeys.length ? "No explicit IFC storey relationship" : storeys.every((storey) => storey.path.length === 0) ? "IFC building storey" : storeys.some((storey) => storey.path.some((edge) => edge.host_derived)) ? "Storey inherited through explicit IFC host relationships" : storeys.every((storey) => storey.path.length === 1 && storey.path[0].predicate === "contained_in") ? "Explicit IFC spatial containment" : "Storey inherited through IFC containment / decomposition";
    membership.set(step, { levels, label: levels.join(" / "), storeys, provenance });
  }
  const unknown = { levels: [UNASSIGNED], label: UNASSIGNED, storeys: [], provenance: "No explicit IFC storey relationship" };
  return {
    levels: [...labels].sort(),
    forNode: (node) => membership.get(Number(typeof node === "object" ? node?.step_id : node)) || unknown,
    matches: (node, label) => label === "all" || (membership.get(Number(typeof node === "object" ? node?.step_id : node)) || unknown).levels.includes(label),
  };
}

/**
 * Read a bounded, independently audited world-placement delta. "Unchanged"
 * refers only to placement; it does not assert identical geometry/properties.
 * Incomplete, malformed or wrong-model evidence is deliberately unknown.
 */
export function createMovementLookup(evidence, { candidateSha256, sourceSha256 } = {}) {
  const unknown = (reason) => ({ status: "unknown", label: "Placement evidence unavailable", reason, delta_mm: null, classification: null });
  let failure = null; const checked = new Map(); const moved = new Map();
  if (!evidence || evidence.schema !== "velocity.viewer_placement_evidence.v1") failure = "No supported independent placement evidence";
  else if (!SHA256.test(candidateSha256 || "") || !SHA256.test(sourceSha256 || "") || evidence.candidate_sha256 !== candidateSha256 || evidence.source_sha256 !== sourceSha256) failure = "Placement evidence does not match the displayed IFC and its source";
  else if (evidence.scope !== "world_placement_only" || evidence.audit?.passed !== true || !SHA256.test(evidence.audit?.sha256 || "") || !Array.isArray(evidence.products) || !Array.isArray(evidence.moved) || evidence.products.length !== evidence.products_compared || evidence.moved.length !== evidence.moved_products || !Number.isFinite(evidence.translation_tolerance_m) || evidence.translation_tolerance_m <= 0) failure = "Placement evidence is incomplete or malformed";
  else {
    const stepIds = new Set();
    for (const product of evidence.products) {
      if (!Array.isArray(product) || product.length !== 2 || !Number.isInteger(product[0]) || product[0] <= 0 || typeof product[1] !== "string" || !product[1] || checked.has(product[1]) || stepIds.has(product[0])) { failure = "Placement inventory contains invalid or duplicate identities"; break; }
      checked.set(product[1], product[0]); stepIds.add(product[0]);
    }
    for (const row of evidence.moved) {
      if (!row || !checked.has(row.global_id) || moved.has(row.global_id) || !finiteVector(row.delta_mm) || !["direct", "propagated"].includes(row.classification)) { failure = "Moved-product evidence contains invalid or duplicate identities"; break; }
      moved.set(row.global_id, row);
    }
  }
  return {
    valid: failure === null,
    reason: failure,
    forNode(node) {
      if (failure) return unknown(failure);
      const globalId = node?.global_id || node?.ifc_global_id;
      const step = Number(node?.step_id ?? node?.ifc_step_id);
      if (!globalId || checked.get(globalId) !== step) return unknown("This IFC identity is outside the audited product inventory");
      const row = moved.get(globalId);
      // The oracle also checks products without ObjectPlacement. Do not invent
      // numeric coordinates for those products merely because they did not move.
      if (!row) return { status: "unchanged", label: "Placement unchanged", delta_mm: null, classification: null, reason: "Independent comparison found no world-placement or placement-presence change", tolerance_m: evidence.translation_tolerance_m };
      return { status: "moved", label: row.classification === "direct" ? "Placement moved · direct edit" : "Placement moved · propagated edit", delta_mm: [...row.delta_mm], classification: row.classification, reason: row.reason || "Independent source / candidate world-placement comparison", tolerance_m: evidence.translation_tolerance_m };
    },
  };
}
