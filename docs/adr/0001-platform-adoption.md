# ADR-0001: Adopt Agentic Dev Environment platform

- **Status:** Accepted
- **Date:** 2026-05-09
- **Deciders:** Jason
- **Tags:** platform, foundations, adoption

> Format: MADR 4.x with three documented extensions. See `template.md`.

## Context and Problem Statement

`game-night-pwa` is an existing project with substantial functionality and AWS infrastructure documented in `CLAUDE.md`. The Agentic Dev Environment platform offers standards, AI configuration, and reusable workflows that mature solo development. Adopting it surgically (without disrupting existing code or workflows) gives this project access to the platform's discipline.

The question: which platform standards apply as-is to this project, and which need project-level deviations documented?

## Decision Drivers

- **Existing project investment.** 8 Lambdas in production, ~30 source files, 4 test files, custom MCP server, real users (or imminent real users) per the live-data context.
- **Stack mismatch with platform defaults.** Platform's typescript-app template assumes Next.js + TypeScript + pnpm + Vercel; this project is vanilla JS + Vite + Tailwind + GitHub Pages.
- **Existing branch convention.** Project uses `master` as the default branch (deploy.yml triggers on push to `master`). Platform standards reference `main`.
- **AWS region.** Platform default is us-east-1; this project is us-east-2.
- **Email provider.** Platform default is AWS SES; this project uses Postmark.
- **Auth.** Project uses Cognito Hosted UI shared with two other projects (meal-planner, jaetill-portal).
- **AI labor available.** The retrofit benefits from platform agents but the project must coexist with existing `.claude/` worktrees and custom MCP.

## Considered Options

The bundle is the deviations the project will carry, listed alongside the platform standards:

- **Sub-decision 1 — Frontend deploy:** chose **GitHub Pages (existing)** over platform-default Vercel
- **Sub-decision 2 — Backend language:** chose **Node.js CommonJS Lambdas (existing)** over platform-default Python
- **Sub-decision 3 — Default branch:** chose **`master` (existing)** over platform-default `main`
- **Sub-decision 4 — AWS region:** chose **us-east-2 (existing)** over platform-default us-east-1
- **Sub-decision 5 — Email provider:** chose **Postmark (existing)** over platform-default SES
- **Sub-decision 6 — Auth:** chose **shared Cognito user pool (existing)** as project-controlled
- **Sub-decision 7 — `.claude/` integration:** chose **additive layering** over wholesale replacement of the existing setup

## Decision Outcome

We adopt the platform with the seven deviations above documented and accepted. The platform's standards apply by default; deviations are noted in this ADR and respected throughout the integration.

Specifically:

1. **Apply platform standards as-is:** 03 Testing (Vitest aligns), 04 Quality gates (ESLint flat config + Prettier; JS variant), 05 Documentation (MADR + MkDocs Material), 09 Release management (release-please).
2. **Apply with project-specific config:** 01 Source control (Conventional Commits + signed commits work on `master` as well as `main`), 02 CI/CD (additive workflows; existing deploy.yml retained), 07 Secrets (1Password references for personal; existing AWS Secrets Manager + SSM for app), 10 AI workflows (additive `.claude/` content), 11 User feedback (new endpoint in the Lambda pattern).
3. **Apply with effort:** 06 Observability (add Sentry; significant), 08 IaC (retrofit existing AWS as Terraform; significant — see Phase 6 of the integration plan).
4. **Documented deviations:** `master` branch; us-east-2; Postmark; GitHub Pages; vanilla JS.

## Consequences

### Positive

- Project gains the platform's discipline (CI gates, AI review battery, ADRs, runbooks).
- The project becomes the proof-of-concept that the platform's standards apply to a non-greenfield, non-default-stack project.
- The MCP server + worktree pattern in `.claude/` continues to work alongside platform agents.

### Negative

- **IaC retrofit is non-trivial.** ~500 lines of Terraform plus iterative import-and-plan cycles to achieve zero-diff. Worth doing but not on day one.
- **Stack-mismatch deviations** make this project a less-clean reference for "the platform applied to a typescript-app." The python-service template remains the cleanest reference.
- **Two `.claude/` patterns coexist.** The platform's agents/commands/hooks layer alongside the project's worktrees. Long term this could fragment; mitigation: revisit at Phase 2 close to see if any consolidation is warranted.

### Neutral

- The project's `memory/` directory continues to serve as project-local memory; Cowork's user-spaces memory continues to serve as cross-project memory. Both are valid; the new CLAUDE.md update documents the relationship.
- Postmark vs SES is a reversible decision; if Postmark ever becomes a problem, switching to SES is a per-project ADR.
- `master` vs `main` is purely cosmetic; release-please and CI workflows handle both.

## Pros and Cons of the Options

### Sub-decision 1: Frontend deploy

| Option | Trade-off |
|---|---|
| **Migrate to Vercel** | Aligns with platform default; rewrites build pipeline; loses jaetill-github-io custom domain; introduces vendor account. |
| **Stay on GitHub Pages** (chosen) | Zero migration; existing `gamenights.jaetill.com` CNAME works; no Vercel account needed; deploy.yml continues as-is. |

### Sub-decision 2: Backend language

| Option | Trade-off |
|---|---|
| **Migrate to Python** | Aligns with platform default; massive rewrite of 8 Lambdas; loses CommonJS Node ecosystem the project's tooling assumes. |
| **Stay on Node.js CommonJS** (chosen) | Zero migration; works with existing tooling. |

### Sub-decision 3: Default branch

| Option | Trade-off |
|---|---|
| **Rename to `main`** | Aligns with platform default; touches the existing deploy.yml + GitHub Pages config; small but real disruption. |
| **Stay on `master`** (chosen) | Zero migration; platform reusable workflows accept any branch via the `on.push.branches` pattern. |

### Sub-decision 4: AWS region

| Option | Trade-off |
|---|---|
| **Migrate to us-east-1** | Aligns with platform template default; massive resource recreation across 8+ resources. |
| **Stay in us-east-2** (chosen) | No migration; all new IaC parameterized to us-east-2. |

### Sub-decision 5: Email provider

| Option | Trade-off |
|---|---|
| **Migrate to AWS SES** | Aligns with platform default; reverify domain (DNS already DKIM-configured for Postmark); learning curve. |
| **Stay on Postmark** (chosen) | Zero migration; existing DKIM, SPF, DMARC config in Route 53; meeting Feb 2024 AOL/Yahoo bulk-sender requirements. |

### Sub-decision 6: Auth

| Option | Trade-off |
|---|---|
| **Project-controlled user pool** | Cleaner ownership; massive migration of existing users + invites + sessions. |
| **Shared Cognito user pool** (chosen) | Existing auth continues to work; integration with meal-planner + portal preserved; per-app App Client retains isolation. |

### Sub-decision 7: `.claude/` integration

| Option | Trade-off |
|---|---|
| **Replace existing `.claude/`** | Cleaner but destroys the worktree-based parallel-agent setup that's already in productive use. |
| **Additive layering** (chosen) | Platform agents/commands/hooks coexist with worktrees; merge logic for `settings.json` deduplication; longer-term consolidation revisit possible. |

## Implementation notes

- Integration plan: [`docs/verification/game-night-pwa-integration-plan.md`](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/verification/game-night-pwa-integration-plan.md) in the platform repo.
- Phase 6 (IaC retrofit) is its own dedicated effort; expect a follow-up ADR (ADR-0002 or higher) once the import patterns are validated.
- The custom MCP server in `mcp/` is application code, not platform infrastructure — it stays untouched.
- The `memory/` directory is project-local memory; Cowork's user-spaces memory at `~/AppData/Roaming/Claude/.../spaces/<id>/memory/` is separate and complementary.
- The `master` branch convention is documented in this ADR; release-please and platform workflows accept it transparently.

## Links

- Platform repo: https://github.com/jaetill/agentic-dev-environment
- Platform ADR-0001 (foundations): https://github.com/jaetill/agentic-dev-environment/blob/main/docs/adr/0001-platform-foundations.md
- Workspace `CLAUDE.md` for game-night-pwa (source of project context).
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
