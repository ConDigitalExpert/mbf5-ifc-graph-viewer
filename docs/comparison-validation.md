# Standalone comparison viewer validation

Validated on 2026-09-18 against the local build at `http://127.0.0.1:4173/comparison.html`.

## Artifact checks

- `node --check dist/comparison.js` — passed.
- `node --check scripts/build-comparison-index.mjs` — passed.
- `npm run build:comparison` — passed.
- `dist/data/comparison_index.json` — valid JSON, 640 comparison records, 23 graph nodes, 26 graph edges.
- The existing `dist/index.html`, `dist/styles.css`, and `dist/viewer.js` were left unchanged by the standalone comparison implementation.

## Browser smoke checks

| Check | Result | Evidence |
| --- | --- | --- |
| Standalone route loads | Passed | Title `MBF5 · Hallway Change Studio` and route `comparison.html` |
| Original model loads | Passed | Original canvas leaves loading state and renders source geometry |
| Revised model loads | Passed | Revised canvas leaves loading state and renders revised geometry |
| Human-readable story | Passed | Six topic cards: ceiling, access, conduit, ducts, piping, fire protection |
| Graph is nodes and edges | Passed | 23 SVG nodes and 26 SVG edges present |
| Story selection | Passed | Ceiling card renders before/after, evidence, and validation |
| Change lens | Passed | Full-viewport curtain opens from a story card, graph node, or model element; linked change set is outlined and context is ghosted |
| Exact changed-element focus | Passed | Lens cycles through the linked change records, focuses the selected element, and shows a source/revised delta marker when browser geometry is available |
| Source/revised reveal | Passed | Curtain slider and Source/Revised controls switch the visible model side without changing the source or graph |
| Context isolation | Passed | Changed only / Show context toggles the surrounding model between ghosted and visible states |
| Graph issue selection | Passed | Conduit issue node selects the conduit story and model context |
| Graph element selection | Passed | `element:1328852` selects the conduit bay change and exposes technical provenance |
| Model selection | Passed | Direct source-canvas click produces a linked model-element selection state |
| Technical drawer | Passed | Shows STEP ID, GlobalId, entity class, geometry ID, stage, and source paths |
| Split / overlay | Passed | Both modes switch without page navigation; overlay opacity control is active |
| Camera controls | Passed | Fit, top, front, reset, Fit both, inertial orbit, pan, zoom, and camera sync controls present |
| Guided playback | Passed | Play changes cycles through six topics and changes button state to Pause |
| Console errors | Passed | No browser error logs during smoke test |

## Data integrity

The comparison is read-only with respect to the IFC and existing graph/bridge artifacts. It consumes:

- original source hash `b50ea1aa9fefc232b8bf485388245111e6d6bf011eb7ebdaf180096ba162a1ea`;
- revised hallway IFC hash `1448f524ce0d5c53ff3afcca7ac515024c538cfa71623282f560e98fe163e90e`;
- stable STEP ID and GlobalId mappings carried by the existing scene bridge and graph index.

No Stage 2 edit was performed by the comparison viewer.
