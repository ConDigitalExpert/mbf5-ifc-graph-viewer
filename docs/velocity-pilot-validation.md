# Velocity pilot publication validation

Date: 2026-09-25. Scope: separate candidate model page and data on the existing
GitHub Pages site. The hallway model remains the default. No approval is granted.

The source IFC is the exact delivered pilot candidate:
`2ed04a2e9e1fe471a1af9d4b36ffed212ed969d4feb1655da80e04dd581c7475`.
Its 371 moved products retain their original GlobalIds. The pre-authored ceiling
instruction translates the affected products by -0.15 m in Z.

The browser assets were rebuilt on Velocity in Slurm job 1011. The build verified:

- 7,542 products and 3,648 represented products.
- Exact equality of represented IFC STEP IDs and rendered GLB mesh node names.
- Zero missing represented products and zero dangling IFC entity references.
- Candidate IFC unchanged before and after conversion.
- GLB and compressed IFC hashes match `publication-validation.json`.
- Decompressing the published IFC reproduces the delivered candidate SHA-256.
- Browser payload: 17,905,108 bytes; 9,097 graph nodes and 60,873 semantic edges.

This scene uses direct IFC-to-glTF conversion and an external identity bridge.
It does not claim that an OpenUSD scene was generated. The shared viewer supports
page-specific index and saved-view keys, retaining the original defaults.

Pre-publication checks passed:

- `node --check dist/viewer.js`.
- `npm run typecheck`.
- `npm run test:jev`: 7 tests passed from the current GitHub main baseline.
- Existing hallway page: 3,712 mapped elements loaded, no console errors.
- Candidate page: 3,648 mapped elements loaded, no console errors.
- Candidate canvas selection resolved STEP 1319365 and GlobalId
  `32no_m1df8GAT28VN$V72v`; graph search returned exactly that product.
- Candidate status and compressed IFC / new-clash links remain visible above
  the canvas. The inspector starts closed so the 3D model is visible immediately.

The candidate has 1,277 hard and 5,468 soft clash reports, including 8 introduced
hard clashes. The covering rule includes insulation, so counts require domain
triage. The page displays this review boundary. The Mac/Linux native geometry
comparison remains unresolved. Publication does not imply coordination acceptance.

Only the model, derived browser assets and bounded public review metadata are
published. Private execution logs, dependency environment details, the full source
snapshot, local machine paths and approval records are excluded.
