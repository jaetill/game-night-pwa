# Secrets Manager — two secrets relevant to game-night-pwa.
#
#  - game-night/prod/github-token  : project-owned (created during Phase 7
#                                    activation); imported into Terraform.
#  - shared/postmark-api-key       : SHARED with meal-planner; the canonical
#                                    Terraform definition lives elsewhere.
#                                    Referenced as a data source only.
#
# Note: the secret VALUES are NOT stored in Terraform state under normal
# circumstances. Terraform state only tracks the secret resource (name, ARN,
# rotation config), not the secret material. See `aws_secretsmanager_secret`
# and `aws_secretsmanager_secret_version` for the full pattern; here we only
# manage the parent secret.

resource "aws_secretsmanager_secret" "github_token" {
  name        = "game-night/prod/github-token"
  description = "GitHub PAT for the feedback Lambda — Standard 11"

  # `recovery_window_in_days` and `force_overwrite_replica_secret` are
  # Terraform-side concepts (only consulted at delete/replicate time);
  # AWS doesn't return them via Describe. Setting them in config still
  # shows as "in-place change" on import. Ignore so the plan is truly zero.
  lifecycle {
    ignore_changes = [recovery_window_in_days, force_overwrite_replica_secret]
  }
}

# The Postmark key is owned by meal-planner's Terraform; here we only need a
# data source so other resources can reference its ARN.
data "aws_secretsmanager_secret" "postmark" {
  name = "shared/postmark-api-key"
}

# ── Web Push / one-click RSVP secrets ────────────────────────────────────
# Created via CLI (values set out-of-band, same discipline as github-token)
# and imported into Terraform state.

resource "aws_secretsmanager_secret" "push_vapid" {
  name        = "game-night/prod/push-vapid"
  description = "VAPID keypair for game-night web push"

  lifecycle {
    ignore_changes = [recovery_window_in_days, force_overwrite_replica_secret]
  }
}

resource "aws_secretsmanager_secret" "rsvp_link" {
  name        = "game-night/prod/rsvp-link"
  description = "HMAC secret for one-click RSVP email links"

  lifecycle {
    ignore_changes = [recovery_window_in_days, force_overwrite_replica_secret]
  }
}
