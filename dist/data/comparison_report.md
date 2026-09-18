# MBF5 hallway change studio

This report describes the standalone before-and-after comparison at [`../comparison.html`](../comparison.html). It compares the original IFC source with the revised hallway-coordination IFC while keeping IFC as the authoritative model and using the existing graph and scene bridge for element identity.

## Source chain

| Stage | Model state | IFC SHA-256 | IFC entities | Evidence |
| --- | --- | ---: | ---: | --- |
| Source | Original `/Users/mohamedadel/Downloads/MBF5-TEST-COORDINATION.ifc` | `b50ea1aa9fefc232b8bf485388245111e6d6bf011eb7ebdaf180096ba162a1ea` | 1,325,534 | Original source capture |
| 1 | Ceiling and hosted services lowered | `5a6e38fac83139580949c30ae988cbff532aeaedb8d37aeea5705e9d78035807` | 1,325,990 | `stage2_ceiling_down_150mm/edit_manifest.json` |
| 2 | Ceiling access panels added | `faa5522210bdec70ac68b00287edbad1f509e18444124468e345b24154992089` | 1,326,846 | `stage2_ceiling_access_panels_20260918/edit_manifest.json` |
| 3 | Hallway routing solution applied | `1448f524ce0d5c53ff3afcca7ac515024c538cfa71623282f560e98fe163e90e` | 1,327,294 | `stage2_hallway_coordination_20260918/edit_manifest.json` |

The comparison page loads the original browser geometry from `data/MBF5-TEST-COORDINATION.glb` and the revised browser geometry from `data/MBF5-TEST-COORDINATION.hallway-coordination.scene.glb`. These are derived display payloads. Stable STEP IDs, GlobalIds, geometry IDs, scene identity, hashes, and source paths remain in the machine-readable manifest and technical drawer.

## Change story

| Topic | Before | Revised result | Evidence |
| --- | --- | --- | --- |
| Ceiling services | Services were at the prior ceiling elevation. | 371 affected products move down 150 mm with the coordinated ceiling zone; 205 hosted fixtures were inferred and 143 attached distribution ports were carried in the evidence. | Ceiling stage manifest, impact report, before/after records |
| Maintenance access | Equipment and valves lacked a coordinated access presentation. | 32 600 × 600 mm access panels are represented through 224 IFC records covering panels, openings, relationships, and access properties. | Access-panel manifest and scope |
| Conduit route | Electrical reservation competed with the hallway service routes. | A 4 ft wide × 6 in deep route is reserved below the beams, with 2 in Unistrut below. | Hallway edit instruction and impact report |
| Duct routing | Selected duct cells conflicted with the electrical reservation. | 8 route operations shift connected duct cells and standard fittings while preserving duct size signatures. | Hallway edit manifest and validation |
| North-wall piping | Main piping and tap windows occupied competing elevations. | Glycol, mechanical, and domestic routes use the low north-wall rack; top tap windows remain top tapped and are lowered to keep the electrical route above. | Hallway implementation report and validation |
| Fire protection and lighting | Branches crossed the lighting coordination zone. | Fire-protection branches are lifted where beam clearance permits; the transverse branch stays below the conduit bay and clears lighting. The sprinkler main remains beside the mechanical mains. | Hallway validation and impact report |

## Interactive comparison design

- **Split view** shows original and revised geometry together with synchronized inertial orbit, pan, zoom, fit, top, front, and reset controls.
- **Overlay view** stacks both display layers and exposes a before-opacity control for direct visual change inspection.
- **Story cards** translate the edits into construction language and show before, after, why it matters, evidence, and validation in one place.
- **Graph view** is a real SVG nodes-and-edges graph. Issue nodes connect to system nodes, which connect to element nodes. Selecting an issue selects its story and highlights the related model context; selecting an element node selects its exact staged record.
- **Model selection** follows the same path in reverse. Clicking a rendered element resolves its stable step identity, then selects its linked change where a staged record exists.
- **Technical provenance** is secondary UI. It exposes STEP ID, GlobalId, entity class, geometry ID, glTF node, hashes, stage, and source paths without making those codes the primary user experience.
- **Playback** walks through the six human-readable coordination topics and updates the highlight, story, graph, and timeline together.

## Validation

The comparison manifest reports `passed_with_known_limitations`. Its checks include:

- Original and revised IFC hashes captured.
- Original STEP IDs and GlobalIds preserved through the hallway stage.
- Ceiling world deltas match the requested 150 mm downward move.
- Access-panel target coverage and host fit validated.
- Conduit bay and beam clearance validated.
- Duct sizes unchanged.
- Fire branches clear lighting.
- North-wall main and sprinkler adjacency checks passed.
- No dangling IFC references.
- Scene identity bridge passed.

The browser smoke test is recorded in [`../../docs/comparison-validation.md`](../../docs/comparison-validation.md). The verified local route is `comparison.html`; the same route is published with the GitHub Pages deployment.

## Known limitations retained from source evidence

1. Some ceiling hosting is inferred geometrically because the source IFC contains no explicit product host relationship for the selected fixtures. The stage evidence records a 0.5 m footprint tolerance.
2. The hallway report retains 468 conservative AABB candidate pairs as review candidates. They are not asserted as hard clashes by the edit stage.
3. Browser geometry is a derived glTF display layer. IFC, graph manifests, edit manifests, and scene bridge indexes remain authoritative for identity and provenance.

The original IFC, existing graph data, scene bridge data, GlobalIds, STEP IDs, and relationships were not modified by the comparison viewer work.
