# Project instructions

This repository contains the MBF5 IFC knowledge graph viewer and its Stage 2
evidence artifacts.

For semantic decision architecture, read and follow
`docs/jev-policy.md`.

- Keep IFC authoritative and preserve stable STEP ids, GlobalIds, scene ids,
  relationships, hashes, and provenance.
- Keep deterministic BIM parsing, geometry, validation, permissions, and
  writeback in code.
- Use `$typesafe-ai` for Jev workflow design. Jev output is a recommendation;
  policy code controls actions and human approval controls consequential edits.
- Do not place TypeSafe API keys in the browser bundle or static `dist/` files.
- Run `npm run typecheck` and `npm run test:jev` after changing `src/`.
