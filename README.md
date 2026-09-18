# MBF5 OpenUSD BIM Scene Viewer

This static site is the Phase 1 viewer for `MBF5-TEST-COORDINATION.ifc`.
IFC remains authoritative. OpenUSD is the working scene layer, glTF is the
browser delivery layer, and Babylon.js is the browser runtime.

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

1. Double click a rendered element to open its graph node, GlobalId, and explicit interfaces.
2. Click a graph node to focus and highlight its linked display mesh and inspect the USD prim / scene geometry mapping.

The original IFC file is not modified by the viewer build. Geometry and
attribute changes must be applied to a cloned IFC by the future Stage 2
executor, then the USD/glTF scene bundle must be regenerated and validated.
