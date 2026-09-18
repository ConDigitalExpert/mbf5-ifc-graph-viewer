# MBF5 IFC Graph Viewer

This static site is the Phase 1 viewer for `MBF5-TEST-COORDINATION.ifc`.

- `dist/data/MBF5-TEST-COORDINATION.ifc.gz` is a compressed source model archive used for traceability; the original IFC remains unchanged in the analysis workspace.
- `dist/data/MBF5-TEST-COORDINATION.glb` is derived display geometry. Each glTF node is named `id-<IFC STEP id>` so 3D picks resolve to the graph index.
- `dist/data/viewer_index.json` contains compact graph nodes, explicit semantic edges, and the source SHA-256.
- `dist/data/graph_manifest.json` points to the full Phase 1 graph artifacts stored beside this viewer in the analysis workspace.

The browser supports both selection directions:

1. Double click a rendered element to open its graph node, GlobalId, and explicit interfaces.
2. Click a graph node to focus and highlight its linked display mesh.

The original IFC file is not modified by the viewer build.
