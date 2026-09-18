# MBF5 OpenUSD BIM Scene Viewer

## Standalone before-and-after comparison

The separate [`Hallway Change Studio`](./dist/comparison.html) presents the original IFC and the revised hallway-coordination model side by side or as an overlay. Its **Change lens** turns a selected issue into a full-viewport before/after curtain: changed elements stay outlined, unaffected context can be ghosted, the exact selected element gets a focus marker, and a Source ↔ Revised slider reveals the physical difference in place. It connects rendered elements to a human-readable change story and a true nodes-and-edges graph. Stable IFC identifiers, hashes, scene identity, and source provenance are available in the secondary technical drawer and [`comparison_index.json`](./dist/data/comparison_index.json).

This static site is the linked viewer for `MBF5-TEST-COORDINATION.ifc`.
IFC remains authoritative. OpenUSD is the working scene layer, glTF is the
browser delivery layer, and Babylon.js is the browser runtime.

The current snapshot includes the validated Stage 2 hallway coordination
branch built on top of the ceiling access-panel branch. It contains a
4 ft x 6 in conduit bay with 2 in Unistrut, preserved-size duct reroutes,
north-wall mechanical and domestic piping coordination, and fire-protection
branch separation from lighting. The earlier ceiling access-panel evidence
remains available beside it. The original IFC is unchanged.

- `dist/data/MBF5-TEST-COORDINATION.hallway-coordination.ifc.gz` is the current compressed derived IFC archive used for traceability.
- `dist/data/MBF5-TEST-COORDINATION.hallway-coordination.scene.glb` is the current Draco-compressed browser scene; its nodes remain named `id-<IFC STEP id>`.
- `dist/data/MBF5-TEST-COORDINATION.hallway-coordination.scene_bridge.json` links each represented product to its IFC STEP ID, GlobalId, graph node, USD prim, and glTF node.
- `dist/data/hallway_coordination_implementation_report.md` records the applied operations, validation, residual screening candidates, and Stage 2 edit foundation.

- `dist/data/MBF5-TEST-COORDINATION.ceiling-access-panels.ifc.gz` is the compressed derived IFC archive used for traceability; the original IFC remains unchanged in the analysis workspace.
- `bim_scene_delivery/MBF5-TEST-COORDINATION.usdc` is the local OpenUSD working scene. Each USD prim carries IFC identity and provenance custom properties; the browser host does not need to download this binary.
- `dist/data/MBF5-TEST-COORDINATION.ceiling-access-panels.scene.glb` is high-fidelity derived display geometry using `KHR_draco_mesh_compression`; generated access panels are included as selectable IFC nodes. Each glTF node is named `id-<IFC STEP id>` and carries identity extras.
- `dist/data/MBF5-TEST-COORDINATION.ceiling-access-panels.scene_bridge.json` is the complete product-level bridge to IFC, the graph, USD, and glTF.
- `dist/data/MBF5-TEST-COORDINATION.ceiling-access-panels.scene_bridge_index.json` is the compact browser bridge used for selection.
- `dist/data/MBF5-TEST-COORDINATION.ceiling-access-panels.scene.manifest.json` records scene build settings, local coordinate origin, and coverage.
- `dist/data/viewer_index.json` contains compact graph nodes, explicit semantic edges, and the source SHA-256.
- `dist/data/graph_manifest.json` points to the full Phase 1 graph artifacts stored beside this viewer in the analysis workspace.
- `dist/data/phase2_edit_schema.json` defines the future dry-run/apply instruction contract; this published snapshot displays the validated access-panel writeback and remains an inspection client.
- `dist/data/phase2_edit_manifest_schema.json` defines the output manifest for hashes, loss reporting, validation, preservation, and recovery.

The render scene uses local coordinates to retain precision. Its manifest and
bridge store `model_origin_m`; reconstruct IFC world coordinates by adding that
origin to a local scene coordinate before applying a placement or geometry
writeback. OpenUSD is the working scene, while IFC-native geometry remains the
writeback authority. Exact geometry edits require the planned geometry-kernel
adapter; raw browser vertex edits are rejected or reported as lossy.

The browser supports both selection directions:

1. Click a rendered element to open its graph node, GlobalId, and explicit interfaces.
2. Click a graph node to focus and highlight its linked display mesh and inspect the USD prim / scene geometry mapping.

## Viewer controls

- **Frame** fits the complete model.
- **Focus** frames the selected element.
- **Reset** returns to the default perspective view.
- **3D / TOP / FRONT / RIGHT** animate between camera orientations.
- **Drag** orbits, **Shift + drag** pans, and **scroll** zooms.
- **F**, **H**, **R**, **1**, **2**, **3**, and **?** provide keyboard access to the same controls.
- Search accepts element names, IFC classes, GlobalIds, and STEP ids. Each
  selected result exposes its identity bridge, scene ids, IFC provenance,
  relationships, and Stage 2 evidence links.

## GitHub Pages

The repository is configured for GitHub Pages through
`.github/workflows/deploy-pages.yml`. After the repository is created on
GitHub, enable **Settings → Pages → GitHub Actions** if GitHub has not enabled
the Pages environment automatically. Every push to `main` publishes `dist/`.

The original IFC file is not modified by the viewer build. Geometry and
attribute changes must be applied to a cloned IFC by the Stage 2 executor, then
the USD/glTF scene bundle must be regenerated and validated. The edit manifest,
before/after hashes, preservation checks, and scene validation artifacts remain
the source of truth for each writeback.

## Jev decision layer

The repository includes a project-local TypeSafe skill for Codex and Claude
Code, the TypeSafe JavaScript SDK, and a shared Jev decision layer under
`src/intelligence/jev/`. The canonical operating policy is
`docs/jev-policy.md`; the candidate audit is in `docs/jev-audit.md`.

Install or refresh dependencies with:

```bash
npm install
```

Run the bounded decision contract in fail-closed shadow mode:

```bash
npm run jev:shadow:example
npm run jev:shadow -- --input ./path/to/request.json --telemetry ./artifacts/jev/decisions.jsonl
```

Live TypeSafe calls are enabled only when `TYPESAFE_API_KEY` is supplied to a
server-side or CLI process. The key must never be placed in the static viewer
or `dist/`. The default policy keeps geometry, attribute, create, and delete
routes behind deterministic validation and explicit human approval.

Use `$typesafe-ai` in Codex or `/typesafe:typesafe-ai` in Claude Code when
designing or changing Jev workflows. Both agents read the same policy and
share the same application contract.
