# game-night-pwa

A PWA for organizing board game nights with a small friend group. Features: event creation, RSVP tracking, board game collection management (via BoardGameGeek), email invitations and nudges, and host controls.

Hosted at **https://gamenights.jaetill.com**.

This project is built on the [Agentic Dev Environment](https://github.com/jaetill/agentic-dev-environment) platform. The platform's [11 standards](https://github.com/jaetill/agentic-dev-environment/tree/main/docs/standards) define source control, CI/CD, testing, quality gates, documentation, observability, secrets, IaC, releases, AI workflows, and user feedback. Project-specific deviations are documented in [ADR-0001](adr/0001-platform-adoption.md).

## What's here

- [Architecture overview](architecture/overview.md) — high-level shape of the system
- [ADRs](adr/index.md) — architecture decision records for this project
- [Runbooks](runbooks/index.md) — operational playbooks
- [IAM audit](iam-audit.md) — IAM role audit (2026-04-12)

## Stack

- Frontend: Vite + Tailwind + vanilla JS, deployed to GitHub Pages
- Backend: 8 Node.js CommonJS Lambdas behind API Gateway, in **us-east-2**
- Auth: shared Cognito user pool with App Client `34et7dk67ngqep1oqef49te0ic`
- Storage: S3 bucket `jaetill-game-nights` (private; presigned URLs only)
- Email: Postmark
- MCP: custom server in `mcp/` for Claude Desktop / Claude Code integration

## Status

Active. Live at gamenights.jaetill.com.
