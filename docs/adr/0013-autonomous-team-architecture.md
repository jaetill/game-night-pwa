# ADR-0013: Autonomous Team Architecture

- **Status:** Proposed
- **Date:** 2026-05-11
- **Deciders:** Jason
- **Tags:** ai-workflows, ci-cd, platform-architecture

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled.

## Context and Problem Statement

The platform's first wave (ADR-0011, ADR-0012) defined twelve specialist subagents — `code-reviewer`, `security-reviewer`, `test-writer`, `architect`, etc. — and wired them into PR-time and scheduled CI workflows on `game-night-pwa`. Over a focused session, all twelve were proven to do real work: catching bugs, drafting ADRs, writing tests autonomously, classifying alerts.

But the platform is still **advisory-only**: agents post findings as informational comments; PRs can be merged regardless of findings; no agent writes production code; the human (Jason) is the sole author. The platform amplifies one human; it does not replace one.

The goal is to move from "AI augments human author" to "AI **IS** the author; human is approver and director" — driven by three input streams:

1. **The human's prompts** ("add feature X")
2. **User feedback** (bug reports filed via the feedback widget)
3. **Production signal** (Sentry alerts, drift detector, dep advisories)

This ADR specifies the architecture: trust hierarchy, new agent roles, gating model, defenses against adversarial input, and phased rollout.

## Decision Drivers

- The human's bottleneck is implementation, not direction. Reviews, tests, docs are already AI-handled.
- External work intake (the feedback widget) is an attack surface — a friend ("Phil") could spam silly requests; trust must be gradient, not binary.
- Code review must actually **block** PRs, not just suggest. Today's advisory mode means findings can be ignored.
- A "team" of agents is only useful if there's an iteration loop — implementer responds to reviewer feedback, not just produces code once.
- Adding agents is expensive in tokens, prompts, workflows, and surface area to maintain. New agents must earn their separateness.

## Considered Options

- **Option A — Status quo (advisory only).** Keep the platform as a reviewer/tester/doc-writer; human implements everything.
- **Option B — Single autonomous "fullstack developer" agent.** One agent does design, implementation, tests, docs. No specialization.
- **Option C — Specialized team architecture with role-based gating** (this proposal). Agents split by mindset/risk profile, dispatch gated by source-of-work trust tier.

## Decision Outcome

Chosen option: **Option C — Specialized team with three-tier dispatch gating.**

The platform adds three concrete elements:

1. **Two new implementer agents** — one for application code (`implementer`), one for IaC (`iac-implementer`). Split by mindset/risk profile, not codebase area.
2. **Gating model for PR reviews** — `code-reviewer` and `security-reviewer` move from advisory comments to **blocking status checks** on `master`. Branch protection requires those checks green.
3. **Three-tier dispatch model** — work sources have different trust levels; the implementer agent's activation gate differs by source.

The architect agent doubles as the head agent / scrummaster, with extended responsibilities for triage, dispatch decision, and escalation.

## Three-tier dispatch model

The implementer agent only engages on work items where the `ready-for-implementer` label is present. How that label gets applied depends on the work's origin:

### Tier 1 — Internal review chain (auto-dispatch, fast loop)

Findings from agents reviewing existing code:
- `code-reviewer` posts HIGH/MEDIUM finding
- `security-reviewer` posts MEDIUM finding
- `test-writer` notes a coverage gap that's mechanical to fill
- `doc-keeper` flags a documentation mismatch

These are responses to the human's or implementer's own work that the platform itself just validated. The platform cannot manufacture a finding from nothing — it must observe real code. **Auto-dispatch.** `defect-filer` step creates a labeled issue (`origin:internal-review`, `severity:*`); architect or workflow auto-applies `ready-for-implementer` if severity is `medium` or below. HIGH findings still auto-dispatch but with a notification to the human.

### Tier 2 — Production signal (auto-dispatch with rate limit + escalation)

Evidence of real problems in production:
- Sentry alerts (already routed through `incident-responder`)
- `drift-detector` findings (out-of-band AWS changes)
- `dep-watcher` security advisories

These are external signals, but signal source is automated and bounded — a third party (Phil, the public) cannot spam Sentry into firing. **Auto-dispatch, with rate limit** (max N implementer activations per day) and **escalation** (if implementer cannot make progress in 3 iterations, page the human).

### Tier 3 — External requests (label-gated, human dispatch only)

Untrusted-origin work:
- User feedback widget submissions (`feedback` Lambda creates issues)
- The human's own prompts (manually-filed issues with `prompt` label)
- Manually-filed issues by anyone

`triage-bot` classifies; architect summarizes and proposes scope. **Nothing auto-dispatches.** The architect leaves the issue in state `awaiting-dispatch`. The human reads the summary, adds `ready-for-implementer` if real, closes/`wontfix` if not. **This is the gate against adversarial input.**

### Severity vs origin interaction

Severity does not bypass origin gating. A Phil-filed issue marked `severity:critical` still requires human dispatch — the severity itself is untrusted because the originator is untrusted. Only Tier 1 and Tier 2 severities are agent-applied.

## Why one implementer for app code, separate for IaC

The platform already has agents split on a principled axis: **mindset, not codebase area.**

- `code-reviewer` vs `security-reviewer` — different lens (logic vs threat model), same files
- `functional-tester` vs `e2e-tester` — different test layer concerns
- `architect` (decisions) vs `code-reviewer` (correctness)

By that rule:

- **App-code implementer (frontend + backend + tests + docs):** one agent. Cross-cutting changes are normal; splitting on file area would lose context at every boundary. AI agents don't have the human specialization friction that justifies FE/BE splits in human teams.

- **IaC implementer:** separate agent. Terraform/OpenTofu work has fundamentally different failure modes. A bad app commit fails CI and is recoverable in seconds; a bad `tofu apply` can destroy resources, drop state, or expose secrets. The mindset is "I am describing the world" vs "I am running computations." Constraints differ: IaC implementer always opens a PR, never runs `tofu apply`, requires explicit human approval before any destructive change, and refuses anything matched by the `destructive-change-detector` without an Accepted ADR.

**Decision rule for future agent splits:** split on mindset and risk profile. Do not pre-split on codebase area; observe the generalist failing first.

## Iteration loop

When `code-reviewer` or `security-reviewer` posts REQUEST_CHANGES on an implementer-authored PR:

1. The status check fails. Merge is blocked.
2. The `claude-implementer.yml` workflow re-fires in **fix mode** on `pull_request_review` event (action: `submitted` with state `request_changes`).
3. Implementer reads the review comments, addresses each finding, pushes a new commit on the same PR branch.
4. The full review pipeline re-runs on the new commit.
5. Loop maximum **3 iterations** per PR. On cap-out, implementer posts a "stuck — escalating to human" comment and the workflow exits.

The bot-skip guard from earlier work (`if: github.actor != 'claude[bot]'`) is **specifically overridden** for the implementer's fix-mode workflow — bot-initiated re-pushes are expected and desired here. The override is scoped: only the implementer workflow trusts `claude[bot]` actor events, and only when triggered by a review event.

## Gating mechanism

Branch protection on `master` requires these status checks pass:

- `code-review` (was: advisory; becomes: exits non-zero on Critical/High findings)
- `security-review` (same pattern)
- `functional-test` (already gating)
- `e2e-test` (already gating)
- `destructive-change-check` (already gating)

The status-check route is preferred over CODEOWNERS / required-reviews for these reasons:

- GitHub Apps cannot generally be configured as CODEOWNERS (limitation)
- A bot author submitting reviews on its own PR is disallowed by GitHub
- Status checks are infrastructure-level and survive author-changes cleanly

Informational comments still post (review findings remain visible on the PR). The merge gate is the check exit code, not the comment.

## Defenses against adversarial input

In addition to Tier 3 dispatch gating, defense in depth:

1. **Authenticated-only feedback widget.** Anonymous submissions create issues with label `unauthenticated`. `triage-bot` auto-closes those unless promoted by a human.
2. **Per-user rate limit on the feedback Lambda.** Max 5 submissions/day per Cognito username (already partially implemented; tightened from 10/hour to 5/day).
3. **Scope-judgment in architect's triage summary.** Each external request gets a 1-line "is this in scope for the project's purpose?" assessment. Default to "no" for ambiguous cases.
4. **Daily cost ceiling on implementer.** Max 20 implementer activations per day across all sources. Once hit, all new work queues for tomorrow. Bounds worst-case cost on Max subscription budget.
5. **Audit trail.** Every implementer activation appends to a `agent-activations` log issue (or separate log file). Reviewable.

## Consequences

### Positive

- **The human's bottleneck shifts from "writing code" to "approving direction."** This is what the platform was always supposed to enable.
- **PRs that fail review actually block.** No more "merge anyway because the agent's comment is just advisory."
- **External attack surface is contained.** Phil's spam stops at architect's triage — it cannot trigger implementer activations without explicit human dispatch.
- **The platform becomes demo-able.** "12 agents that actually do the work of a team" is a real portfolio narrative.
- **The trust hierarchy is principled and extensible.** New work sources (e.g., a future "research" agent that proposes refactors) slot in at one of the three tiers.

### Negative

- **Implementer can write bad code.** The full review pipeline (code-reviewer + security-reviewer + functional-tester + e2e-tester + test-writer) mitigates but does not eliminate this.
- **The 3-iteration cap means some bugs won't be fixed autonomously.** Edge cases that need real reasoning will escalate to the human. Expected; acceptable.
- **Cost ceiling will sometimes block legitimate work.** A bad-deploy day could burn the daily ceiling on incident fixes alone. Tunable.
- **Branch protection requires more discipline from the human too.** Routine cleanup PRs by Jason still go through the review pipeline. Friction is the point, but it is real.
- **Token-budget impact significant.** A team of agents working in parallel on multiple PRs eats Max subscription rate limits faster than the single-author setup did.

### Neutral

- **The platform's agent count grows from 12 to 14** (adding `implementer` and `iac-implementer`). Adding `defect-filer` brings it to 15 but it could be implemented as a workflow step rather than a separate agent.
- **CODEOWNERS isn't used.** Status-check gating replaces it. Standard 02 (CI/CD) might want a footnote.
- **Pull request author identity becomes mixed** (some PRs from `claude[bot]`, some from `jaetill`). Branch protection and audit tooling must handle both.

## Pros and Cons of the Options

### Option A: Status quo (advisory)

- ✅ Simple. Already shipping.
- ✅ No risk of agent-introduced bugs.
- ❌ Findings can be ignored without trace.
- ❌ Doesn't solve the implementer bottleneck.
- ❌ Doesn't realize the platform's stated promise.

### Option B: Single full-stack agent

- ✅ Minimal new surface area (one new agent).
- ✅ No coordination overhead.
- ❌ One agent doing everything has no internal checks. Review/implement separation is the foundation of the platform's safety story.
- ❌ Cannot differentiate IaC risk from app-code risk.
- ❌ Conflates the "design" and "implement" roles, which deserve separation even for AI.

### Option C: Specialized team with three-tier dispatch

- ✅ Preserves existing safety story (review/implement separation).
- ✅ Three-tier model contains adversarial input explicitly.
- ✅ Implementer / IaC-implementer split matches the real risk gradient.
- ✅ Iteration loop matches how human teams work; agents can actually respond to feedback.
- ❌ More moving pieces: 2 new agents, new workflow, label taxonomy, audit log.
- ❌ Phased rollout means partial benefit until all phases land.

## Implementation notes

Phased rollout, with checkpoint after each phase:

### Phase A — Gating reviews + defect persistence (4h)

- `code-reviewer` workflow exits non-zero on Critical/High findings
- `security-reviewer` workflow exits non-zero on Critical/High findings
- `defect-filer` step (in `claude-pr-review.yml`) creates one labeled GitHub issue per HIGH/MEDIUM finding
- New labels: `defect`, `severity:critical`, `severity:high`, `severity:medium`, `severity:low`, `severity:nit`, `origin:internal-review`, `origin:production-signal`, `origin:external-request`, `ready-for-implementer`, `awaiting-dispatch`, `wontfix`
- Human action: branch protection update (add `code-review` + `security-review` to required status checks on `master`)

### Phase B — Implementer agent (8h)

- `.claude/agents/implementer.md` (agent spec, mindset, constraints, scope cap)
- `.claude/agents/iac-implementer.md` (IaC variant)
- `.github/workflows/claude-implementer.yml` (workflow, label-triggered, opens PR)
- `architect` agent prompt updated to apply `awaiting-dispatch` label and write scope-judgment summary on Tier 3 issues

### Phase C — Iteration loop (3h)

- `claude-implementer.yml` adds `pull_request_review` trigger for fix-mode
- 3-iteration cap with escalation comment
- Bot-skip guard overridden specifically for this workflow

### Phase D — Auto-merger (2h)

- Extend `release-captain` (or new agent) to detect "all green + human `/lgtm` comment"
- Runs `gh pr merge --squash --auto`

### Phase E — Retro agent (3h, lower priority)

- New `retro` agent, weekly schedule
- Reads last 7 days of merged PRs, closed issues, agent run failures
- Writes a "what worked / what didn't" issue, tags `retro`

### Phase F — Architect-as-scrummaster expansion (4h)

- `architect` daily scheduled run
- Reads open issues, prioritizes, applies dispatch labels
- For Tier 3: writes scope-judgment summary, applies `awaiting-dispatch`
- Pages the human on questions

Total: ~24 hours of platform work, split across multiple focused sessions.

## Links

- ADR-0011 (AI workflows standard)
- ADR-0012 (this project's existing autonomy choices)
- Standard 10 (AI Workflows)
- Standard 02 (CI/CD) — needs a footnote about status-check-as-gate
- Standard 11 (User feedback) — needs alignment with Tier 3 gating
- Conversation transcript: 2026-05-11 evening session ("autonomous team" discussion)
