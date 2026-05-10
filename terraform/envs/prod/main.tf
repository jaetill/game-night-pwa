# Production environment for game-night-pwa.
#
# This config retrofits the existing AWS infrastructure documented in
# `CLAUDE.md` into Terraform state per platform ADR-0007 (Phase 6 of the
# integration plan). Resources are imported one slice at a time; each
# slice is reviewed and merged after `tofu plan` shows zero diff.
#
# Layout:
#   backend.tf   — S3 + DynamoDB remote state
#   providers.tf — AWS provider + default tags
#   variables.tf — region / account / env names
#   imports.tf   — `import { ... }` blocks (removed once stable)
#   s3.tf        — jaetill-game-nights bucket + companion resources
#   lambdas.tf   — 9 Lambda functions (added in a later slice)
#   iam.tf       — execution roles + GitHub deploy role (added in a later slice)
#   apigw.tf     — REST API + resources + methods + integrations (added in a later slice)
#   cognito.tf   — data sources for the SHARED user pool / app client
#   secrets.tf   — Secrets Manager (project-owned secrets imported; shared ones as data)
#
# Deployment workflow:
#   1. `tofu init` (one time per clone)
#   2. `tofu plan -out plan.bin` — review the diff
#   3. `tofu apply plan.bin` — only after human review
#
# Lambda code is NOT managed by Terraform — only function metadata.
# `aws lambda update-function-code` deploys remain manual per
# docs/runbooks/deploy.md. Each `aws_lambda_function` resource uses
# `lifecycle { ignore_changes = [filename, source_code_hash, last_modified] }`
# to avoid Terraform fighting the manual deploys.

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
