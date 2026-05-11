# Sentry resources managed by OpenTofu via the jianyuan/sentry community
# provider. Authentication is via the SENTRY_AUTH_TOKEN env var (see
# providers.tf for setup notes).
#
# Resources currently managed:
#   - sentry_issue_alert.prod_error_to_github
#       Fires on new error-category issues in prod; creates a GitHub issue
#       in jaetill/game-night-pwa with labels incident:p0,source:sentry.
#       The claude-incident-responder.yml workflow then triages the issue.
#
# Import procedure (one-time, when first adopting an existing rule):
#   1. Find the rule's numeric ID in Sentry's UI:
#      Settings → Alerts → click the rule → URL contains /rules/<ID>/
#      Or via the API:
#        curl -H "Authorization: Bearer $env:SENTRY_AUTH_TOKEN" `
#          https://sentry.io/api/0/projects/jaetill/game-night-pwa/rules/ `
#          | ConvertFrom-Json | Select-Object id, name
#   2. tofu import sentry_issue_alert.prod_error_to_github `
#        jaetill/game-night-pwa/<ID>
#   3. tofu plan — read diff, back-fill the conditions / actions block
#      below to match. Iterate until plan shows 0 changes.
#
# ⚠️ Import attempt 2026-05-10: BLOCKED — Sentry-side API migration.
#
# The production alert rule "Prod error → GitHub incident:p0" lives at
#   https://jaetill.sentry.io/monitors/alerts/3410028/
# which is Sentry's new unified "Monitor" framework. It does NOT appear in
# any of the three public API endpoints the jianyuan provider knows how to
# query:
#
#   GET /api/0/projects/jaetill/game-night-pwa/rules/    → []  (legacy Issue Alerts)
#   GET /api/0/organizations/jaetill/alert-rules/        → []  (Metric Alerts)
#   GET /api/0/organizations/jaetill/monitors/3410028/   → 404 (Cron Monitors)
#
# When jianyuan/sentry adds a resource type for the new Monitor framework,
# uncomment the block below, run:
#   tofu import sentry_issue_alert.prod_error_to_github jaetill/game-night-pwa/<ID>
# and iterate `tofu plan` until 0 diff.
#
# Until then the rule is UI-managed. Drift-detector won't catch UI changes
# to it. If you (or a future-you) modify the rule, leave a note in this
# file's history so the next IaC pass doesn't fight the UI state.
#
# resource "sentry_issue_alert" "prod_error_to_github" {
#   organization = "jaetill"
#   project      = "game-night-pwa"
#   name         = "Prod error → GitHub incident:p0"
#   action_match = "any"
#   filter_match = "all"
#   frequency    = 60
#   conditions = jsonencode([])
#   actions    = jsonencode([])
# }
