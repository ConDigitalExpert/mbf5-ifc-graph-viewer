# MBF5 OpenUSD BIM Scene Viewer

This static site is the linked viewer for `MBF5-TEST-COORDINATION.ifc`.
IFC remains authoritative. OpenUSD is the working scene layer, glTF is the
browser delivery layer, and Babylon.js is the browser runtime.

The current snapshot includes the validated Stage 2 ceiling translation
evidence: ceilings and their inferred hosted objects are 150 mm lower in the
derived IFC clone and the linked scene bundle. The original IFC is unchanged.

- `dist/data/MBF5-TEST-COORDINATION.ifc.gz` is a compressed source model archive used for traceability; the original IFC remains unchanged in the analysis workspace.
- `bim_scene_delivery/MBF5-TEST-COORDINATION.usdc` is the local OpenUSD working scene. Each USD prim carries IFC identity and provenance custom properties; the browser host does not need to download this binary.
- `dist/data/MBF5-TEST-COORDINATION.scene.glb` is high-fidelity derived display geometry using `KHR_draco_mesh_compression`. Each glTF node is named `id-<IFC STEP id>` and carries identity extras.
- `dist/data/MBF5-TEST-COORDINATION.scene_bridge.json` is the complete product-level bridge to IFC, the graph, USD, and glTF.
- `dist/data/MBF5-TEST-COORDINATION.scene_bridge_index.json` is the compact browser bridge used for selection.
- `dist/data/MBF5-TEST-COORDINATION.scene.manifest.json` records scene build settings, local coordinate origin, and coverage.
- `dist/data/viewer_index.json` contains compact graph nodes, explicit semantic edges, and the source SHA-256.
- `dist/data/graph_manifest.json` points to the full Phase 1 graph artifacts stored beside this viewer in the analysis workspace.
- `dist/data/phase2_edit_schema.json` defines the future dry-run/apply instruction contract; the deployed viewer is still dry-run-only.
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
