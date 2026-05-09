# Architecture Decision Records

This project's ADRs (project-specific decisions). Platform-wide ADRs live in the [Agentic Dev Environment](https://github.com/jaetill/agentic-dev-environment/tree/main/docs/adr) repo and govern this project unless overridden by an ADR here.

## Format

All ADRs follow MADR 4.x with three documented extensions per the platform's [ADR-0008](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/adr/0008-documentation.md):

1. Neutral consequences (third bucket)
2. Implementation notes (separate section)
3. Bundled sub-decisions (when tightly coupled)

ADR template: [`template.md`](template.md) (copied from the platform).

## When to write a project-level ADR

Per platform [ADR-0008](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/adr/0008-documentation.md) §2:

- **Always**: any change in one of the 5 ADR-gated categories (per platform ADR-0003: destructive DB migrations, new external deps/services, security-relevant changes, API contract changes, schema changes).
- **Always**: any deviation from a platform standard (justify why this project diverges).
- **Strongly recommended**: any decision where future-you would reasonably ask "why was this done this way?"
- **Not needed**: routine bug fixes, refactors that don't change architecture, dep version bumps.

## Index

- [ADR-0001 — Adopt Agentic Dev Environment platform](0001-platform-adoption.md) (Accepted)
