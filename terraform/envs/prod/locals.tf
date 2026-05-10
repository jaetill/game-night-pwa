# Shared values across multiple resources. Keeping these in one place so a
# single edit propagates (e.g. bumping the Sentry DSN, log level, or release).

locals {
  # Sentry DSN is the project's "public" key — safe to commit (ships in the
  # frontend Vite bundle anyway). If it ever needs to rotate without a code
  # change, switch this to a `data "aws_secretsmanager_secret_version"` lookup.
  sentry_dsn = "https://8391232c84408298862bdb1052fbf0f2@o4511365332729856.ingest.us.sentry.io/4511365343870976"

  # Release version was set to the HEAD SHA at backfill time (commit b463410).
  # Long-term this should be set per-deploy from the deploy script. Until then,
  # this represents "Phase 5 backfill" and only changes when we redeploy.
  release_version = "b463410f11fef9a61aa5640c94dc743f251a523d"

  # Observability env vars common to every Lambda (per platform Standard 06 / ADR-0009).
  observability_env = {
    SENTRY_DSN      = local.sentry_dsn
    DEPLOY_ENV      = "prod"
    RELEASE_VERSION = local.release_version
    LOG_LEVEL       = "INFO"
  }

  # Note on Lambda code management: every aws_lambda_function resource has
  # `lifecycle.ignore_changes` for filename / source_code_hash / etc. so
  # `tofu apply` doesn't fight the manual `aws lambda update-function-code`
  # deploys documented in docs/runbooks/deploy.md. The `lifecycle` block
  # cannot reference a local (Terraform requires static attribute lists),
  # so the same ignore-changes list is repeated inline on each resource.
}
