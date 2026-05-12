# Grafana dashboards (JSON-as-code)

This directory holds Grafana dashboard definitions as version-controlled JSON.
The dashboards target the `cloudwatch` data source provisioned in
`terraform/envs/prod/grafana.tf` (cross-account IAM role assumed by Grafana
Cloud).

## Why JSON, not the UI

Dashboards built in the Grafana UI are state in someone else's database. By
committing the JSON, the dashboards are reviewable in PRs, restore-from-git is
trivial, and any future project that adopts the platform can import the same
dashboards into its own Grafana stack.

## Importing into a fresh Grafana stack

1. Grafana → Dashboards → New → Import
2. Upload the JSON file (or paste its contents)
3. Pick the CloudWatch data source on the import dialog
4. Save

The exports here were produced via Grafana's "Share dashboard with another
instance" toggle, so stack-specific IDs (UID, namespace, internal IDs) are
stripped and the import will assign fresh ones in the target stack.

## Re-exporting after edits

If you edit a dashboard in the UI and want to keep the change:

1. Dashboard → Share icon → Export as code
2. Toggle **"Share dashboard with another instance"** ON
3. Download file → overwrite the corresponding file in this directory
4. Commit

## Current dashboards

| File | Source | Purpose |
|---|---|---|
| `dashboards/lambda-health.json` | Grafana's suggested-dashboards catalog ("AWS Lambda"), renamed to "Game Night — Lambda Health" | Total + per-function invocations, duration, errors, throttles across all Game Night Lambdas. Time-series, per-FunctionName breakdown in the "Per function details" row. |

## Caveats

- Grafana's `Errors` CloudWatch metric counts **unhandled exceptions**, not
  handler-returned HTTP 4xx/5xx. Sentry covers the latter. Don't read flat
  `Errors` panels as "no errors happening."
- The CloudWatch data source default region is `us-east-2` (set in the
  Grafana UI; not in this repo). Dashboards using `region: default` will
  resolve to `us-east-2`. If you ever multi-region this, dashboards need
  explicit `region` selectors.
