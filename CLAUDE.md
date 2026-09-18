# MBF5 BIM viewer instructions

For semantic decision architecture, follow:

@docs/jev-policy.md

Keep the application contract identical to Codex. The installed TypeSafe skill
is available at `.claude/skills/typesafe-ai`; invoke it with
`/typesafe:typesafe-ai` when designing or changing Jev workflows.

IFC remains authoritative. Do not put TypeSafe credentials in the static viewer
or allow Jev to authorize, apply, or bypass validation for model writeback.
