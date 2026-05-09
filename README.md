# game-night-pwa

A PWA for organizing board game nights with a small friend group.

Live at **https://gamenights.jaetill.com**.

Features:

- Event creation and RSVP tracking
- Board game collection management via [BoardGameGeek](https://boardgamegeek.com/)
- Email invitations and nudges via Postmark
- Host controls (add games, invite users, nudge non-responders)
- Cognito-based auth at `just.jaetill.com` (shared user pool with meal-planner and jaetill-portal)

## Stack

- **Frontend:** Vite + Tailwind + vanilla JS, deployed to GitHub Pages
- **Backend:** 8 Node.js CommonJS Lambdas behind one API Gateway, in **us-east-2**
- **Storage:** S3 bucket `jaetill-game-nights` (private; presigned URLs only)
- **Auth:** shared Cognito user pool with App Client `34et7dk67ngqep1oqef49te0ic`
- **Email:** Postmark
- **MCP:** custom server in `mcp/` for Claude Desktop / Claude Code integration

## Documentation

- 📚 **Live docs:** https://jaetill.github.io/game-night-pwa/ (built from `docs/` via MkDocs Material; see [docs.yml workflow notes](docs/runbooks/index.md))
- 🏛️ **Architecture overview:** [`docs/architecture/overview.md`](docs/architecture/overview.md)
- 📋 **ADRs:** [`docs/adr/`](docs/adr/)
- 📖 **Runbooks:** [`docs/runbooks/`](docs/runbooks/)
- 🔍 **Existing audits:** [`docs/iam-audit.md`](docs/iam-audit.md)

## Platform

This project is built on the [Agentic Dev Environment](https://github.com/jaetill/agentic-dev-environment) platform. The platform's standards (11) and ADRs (12+) define how this project is operated. Project-specific deviations are documented in [ADR-0001](docs/adr/0001-platform-adoption.md) — including the choices to stay on `master` (not `main`), GitHub Pages (not Vercel), CommonJS Lambdas (not Python), us-east-2 (not us-east-1), and Postmark (not SES).

## Quick start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run tests
npm test                # all tests
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report (tiered per platform ADR-0004)

# Lint + format
npm run lint            # ESLint
npm run lint:fix
npm run format          # Prettier (write)
npm run format:check    # Prettier (check only)
```

## Releasing

`release-please` opens a release PR when there are accumulated changes; the `release-captain` AI agent (per platform ADR-0010) reviews and auto-merges. Manual Lambda deploys still happen via the [deploy runbook](docs/runbooks/deploy.md) — Lambda deploys are not yet in the auto-deploy workflow.

## License

Private project; no license file. Personal use.
