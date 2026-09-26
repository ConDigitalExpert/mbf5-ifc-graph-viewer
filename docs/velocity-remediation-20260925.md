# Velocity pilot remediation — 25 September 2026

The viewer now resolves the audit's clipping, level-filter, placement-label, loading, navigation, and saved-view defects. The pilot controller also keeps replay state outside sealed deliveries. These changes improve the noncommercial pilot; they do not approve the IFC candidate or establish full production readiness.

The [pilot candidate viewer](https://condigitalexpert.github.io/mbf5-ifc-graph-viewer/velocity-pilot.html) and the [existing hallway viewer](https://condigitalexpert.github.io/mbf5-ifc-graph-viewer/) remain separate routes and keep separate saved-view storage.

## Corrections

| Area | Resulting behavior |
| --- | --- |
| Section box | Plane signs retain the box interior. Full 0–100% bounds retain the model; partial bounds clip it. Handle positions use the actual `Vector3` bounds. Invalid slider input cannot invert the box or introduce `NaN`. |
| Selection and measurement under clipping | The picking ray is restricted to the section interior, so clipped foreground/background geometry cannot intercept the visible surface. Automated cases include parallel, diagonal, boundary, finite-length, and invalid rays. |
| Storey filters | Explicit IFC spatial containment and decomposition replace element-name guesses. Explicit host relationships can supply inherited storeys, with provenance. Same-named storeys share a filter label while retaining distinct IFC identities. MAIN FLOOR contains 997 represented products. |
| Element movement | An independently checked inventory binds 7,542 product identities to the source and candidate IFC hashes. It distinguishes 23 direct and 348 propagated placement changes. Unchanged placements no longer inherit the scenario's global translation. Missing, malformed, or wrong-model evidence produces “Placement evidence unavailable.” |
| Loading and saved views | Scene controls remain disabled until geometry is ready. Saved views cannot be applied during graph-only loading. Placeholder selection is not treated as view zero; invalid views are rejected. Failed persistence leaves existing views intact. |
| Navigation | Pan explicitly maps an ordinary drag to panning without replacing zoom or modified-drag bindings. Walk starts at the current camera pose; W/WASD/arrows remain movement input once walking. Escape returns to Orbit. Returning from Walk, saving, changing projection, and measuring use the current position and gaze. Walk enters perspective even from an orthographic view. |
| Hidden panels | Closed panels are inert and hidden. Offscreen controls no longer receive focus or scroll the workspace unexpectedly. Reopening restores interaction. |
| Runtime and release gates | Babylon.js and its glTF loader are pinned to **9.28.0** with SHA-384 Subresource Integrity and cross-origin attributes. The Pages workflow runs the local quality gates before deploying static files. |
| Immutable replay | The current pilot controller writes receipts to external state, supports an explicit `--state-dir`, and preserves legacy receipt reads. Restore/fetch/state paths inside sealed deliveries or completed transfer bundles are rejected, including paths reached through symlinks. Historical worker bytes and manifests remain unchanged. |

The discipline filter is explicitly labeled **inferred**. Name-based discipline inference is not an authoritative IFC discipline classification.

## Verification and repeatable local gates

The remediation run passed TypeScript checking, **39 viewer regressions**, **7 policy tests**, and **14 saved-view static/DOM contract checks**. Contract checks and lightweight camera tests do not substitute for rendered browser evidence.

The browser run also displayed a **41.678 m** measurement with section clipping active. This verifies the measurement interaction and numeric display, not independent dimensional accuracy. The hallway regression loaded **3,712 mapped elements** and retained visible geometry with the section box enabled. Raw screenshots and browser state are retained in the remediation evidence package.

From the viewer repository root:

```sh
npm ci
npm run typecheck
npm run test:jev
npm run test:viewer
npm run test:ui-contract
git diff --check
python3 -m http.server 8773 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8773/velocity-pilot.html` in a real browser. Inspect the rendered model and developer console. Retest the hallway route after the pilot route because both use the same viewer implementation.

The movement artifact is reproducible from the published audit and existing identity/edit artifacts:

```sh
node scripts/build-movement-evidence.mjs \
  dist/data/velocity-pilot/placement-audit.json \
  dist/data/velocity-pilot/identity.json \
  dist/data/velocity-pilot/edit_manifest.json \
  dist/data/velocity-pilot/movement-evidence.json
npm run test:viewer
```

That command packages existing audit evidence. It does not rerun IFC placement calculations or modify an IFC.

## Browser retest checklist

This table specifies the tests and required evidence. It is not a claim that every row has completed in every browser. Record an individual outcome, screenshot, URL, timestamp, browser version, and console errors for each execution. In particular, a visible measurement control is insufficient proof of a correct numeric measurement.

| Case | Actions | Required outcome / evidence |
| --- | --- | --- |
| Ready state | Reload; inspect controls while loading; wait for “Model ready · 3,648 mapped elements”. | Camera, clipping, measurement, and save/load controls disabled during loading, enabled after geometry is ready. Model visible after load. |
| Full section | Fit the model; enable section box at six full 0–100% limits. | Geometry remains visible inside the full bounds. Capture the section controls and model together. |
| Partial section | Change X max to 55%. | The corresponding part of the model is clipped while the retained portion remains visible. |
| Handle drag | Drag a visible section handle, then inspect its numeric slider/output. | The corresponding bound changes, remains ordered and within 0–100%, and visibly changes clipping. Reset restores the model. |
| MAIN FLOOR | Reset filters; choose MAIN FLOOR. | A meaningful subset remains. The data regression independently establishes 997 represented product identities; rendered mesh counts can differ from product counts. |
| Unchanged slab | Search STEP `1319365`, GlobalId `32no_m1df8GAT28VN$V72v`; inspect it. | MAIN FLOOR via storey STEP `1108208`; “Placement unchanged”; no applied −150 mm label. |
| Direct ceiling edit | Search STEP `1297742`, GlobalId `05Iva7IZaeIhmBVZ2wZPOb`; inspect it. | “Placement moved · direct edit” and world-placement delta `[0, 0, -150]` mm. |
| Propagated edit | Search STEP `1029860`, GlobalId `0kjDLHNd27y33KLQf3sdBV`. | MAIN FLOOR via storey STEP `995690`; propagated placement change `[0, 0, -150]` mm. |
| Saved Top view | Choose Top; save a uniquely named test view; reload; wait for model ready; load it. | Top camera/projection/section state restored. Placeholder does nothing. Delete only the test view created for this run. |
| Pan / Orbit | Capture before; choose Pan; drag; capture after; return to Orbit and drag again. | Pan translates the view; Orbit rotates. Scrolling still zooms. |
| Walk | Enter Walk; move and look; press W again; exit with Escape. | W moves without leaving Walk. Exit retains current position and gaze. Saving from Walk retains the current perspective view. |
| Measurement | Pick two identifiable visible surfaces; capture markers, line, and numeric value. Repeat with section clipping over foreground geometry. | Value is finite and plausible in model units; it agrees with an independently known distance/tolerance when available. Clipped surfaces do not intercept picks. Mark accuracy unverified if no independent distance is available. |
| Hidden panels | Close tools/inspector; navigate with Tab; reopen. | Closed controls are skipped; no unexpected workspace shift. Reopened controls work. |
| Hallway regression | Load the default route; inspect model, clipping, navigation, and a saved view. | Existing hallway remains accessible, with its own saved views. Pilot-only placement evidence is not applied to it. |

## Evidence boundaries

The exact candidate IFC remains:

```text
source IFC:    b50ea1aa9fefc232b8bf485388245111e6d6bf011eb7ebdaf180096ba162a1ea
candidate IFC: 2ed04a2e9e1fe471a1af9d4b36ffed212ed969d4feb1655da80e04dd581c7475
```

[Published placement evidence](../dist/data/velocity-pilot/movement-evidence.json) records the source/candidate binding and the exact [independent placement audit](../dist/data/velocity-pilot/placement-audit.json). “Placement unchanged” is limited to world placement and placement presence; it does not assert identical geometry or properties. The independent movement audit is historical Slurm job **1003**, not a fresh real-model audit from this remediation.

Fresh Slurm job **1043** completed a synthetic recheck through the corrected controller: 2 indexed elements, 0 clashes, 1 resolved, 0 introduced/persistent/unknown, no truncation, and exit `0:0`. The 454-file sealed package verified before replay, after submission, and after fetch. Its submission receipt stayed outside the package. This proves one synthetic replay; it does not rerun all 19 historical cases or retest the real IFC candidate.

The corrected pilot release **`99513b745b14bce9d42b76e08259bd8317d1838b`** was deployed as a separate versioned release. All **175 files** verified exactly against manifest SHA-256 `9b136dbad878a2356943265512bf6f6b4fcbefccd5689ccb9ac7a96575ec9a4d`; the existing release was preserved. Slurm job **1044** passed all **70 adapter/delivery tests** on the cluster. Slurm job **1045** successfully exercised the current worker with a synthetic model summary: **5 products, 2 represented**. The historical-worker replay, current release regression suite, and current-worker smoke test are distinct evidence scopes.

## Remaining limits

- The candidate remains **unapproved**, **noncommercial**, and coordination review remains open: **1,277 hard clashes remain, including 8 newly introduced hard clashes**. Viewer corrections do not resolve these engineering conflicts.
- The original Mac/Linux clash-engine comparison has an unresolved **7-pair disagreement**. Compare like-for-like runtime/rule profiles; do not silently merge results from different profiles.
- The **25 full integration tests previously excluded remain unrun**. Passing the bounded viewer and pilot gates is not a claim of full system or production release readiness.
- The covering rule includes insulation as well as ceiling coverings; domain triage remains necessary.
- The pilot applies explicit, pre-authored edits to an existing IFC. It does not demonstrate autonomous document-to-IFC generation or autonomous design approval.
- Historical contaminated extractions remain evidence. Replaying with the corrected controller does not repair old controller bytes or justify rewriting a sealed manifest.
