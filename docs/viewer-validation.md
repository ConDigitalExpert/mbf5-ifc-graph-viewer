# BIM viewer redesign validation

Validation date: 2026-09-18

## Authoritative model and bridge

- IFC source remains authoritative; no IFC, knowledge-graph, scene-bridge, GlobalId, STEP ID, relationship, or Stage 2 evidence file was changed by the viewer redesign.
- Active derived branch: `applied-hallway-coordination`.
- Source SHA-256: `1448f524ce0d5c53ff3afcca7ac515024c538cfa71623282f560e98fe163e90e`.
- Scene payload: `data/MBF5-TEST-COORDINATION.hallway-coordination.scene.glb`.
- Bridge index: `data/MBF5-TEST-COORDINATION.hallway-coordination.scene_bridge_index.json`.
- Loaded model evidence: 3,712 mapped scene elements; graph summary 3,720 IFC elements, 3,803 distribution ports, 61,082 semantic edges, and 0 dangling entity references.

## Browser smoke checks

| Surface | Check | Result |
| --- | --- | --- |
| Load | Hallway scene and bridge index load together | Passed; model ready with 3,712 mapped elements |
| Layout | Full viewport workspace, overlay tools, collapsible inspector, graph rail, resizable inspector boundary | Passed visually in Chrome |
| Camera | Fit, focus, reset, isometric, top, front, right, perspective, orthographic | Passed |
| Navigation | Orbit, inertial pan/zoom, walkthrough mode, WASD/arrow hint, Esc return | Passed |
| Sectioning | Six clipping planes, live slider update, section status, reset, viewport section box handles | Passed; X min test moved to 20% and reset returned to full model |
| Measurement | Two-point pick and distance readout | Passed; rendered distance was 32.28 m in the hallway view |
| Visibility | Normal, ghost, x-ray, isolate, hide/show, discipline/level/system filters | Passed; filter reset returned to all visible |
| Selection | Rendered mesh to inspector and graph node to rendered element | Passed; verified STEP `#1328852`, GlobalId `3HNodzs3H2YQFrqEC$_gk`, mapped glTF node, USD prim, and geometry ID |
| Provenance | Stage 2 state, applied delta, edit manifest, impact report, and validation links remain visible | Passed |
| Runtime errors | Browser page console errors | None observed; unrelated Chrome extension warnings were excluded |

## Performance observation

The final local browser build measured approximately 32–61 fps while orbiting and changing views on the hallway model, with the default isometric view rendering at a stable interactive rate. The redesign removes the expensive per-element shadow-caster pass and bloom pass, uses FXAA/sharpening, and applies a bounded render scale for a better viewport-performance balance.

## Scope and limitations

- This validation covers the static browser viewer and its current hallway branch. It does not perform Stage 2 edits or write to the IFC.
- Babylon pointer controls are attached to the canvas and the CSS includes a responsive mobile layout. A physical touch device test was not available in this browser smoke pass.
- Saved camera views use browser local storage and are intentionally viewer state; they do not alter IFC or graph data.
