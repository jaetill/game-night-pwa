variable "project_name" {
  type        = string
  description = "Project slug used in tags and resource names."
  default     = "game-night-pwa"
}

variable "env" {
  type        = string
  description = "Deployment environment label."
  default     = "prod"
}

variable "aws_region" {
  type        = string
  description = "AWS region for this environment."
  default     = "us-east-2"
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID — used in IAM ARN constructions and the API Gateway invoke source-arn."
  default     = "214599503944"
}

# ── Grafana Cloud — per-stack external ID for the cross-account trust policy ─
# Treated as sensitive (defense in depth) even though Grafana's external ID is
# not a cryptographic secret in the strict sense. Kept out of source so the
# public game-night-pwa repo doesn't expose the value to scrapers. Supply via
# the TF_VAR_grafana_external_id environment variable before running `tofu
# plan` or `tofu apply`; the value is shown in the Grafana Cloud UI when
# adding the AWS CloudWatch data source.
variable "grafana_external_id" {
  type        = string
  description = "External ID Grafana Cloud requires in the trust policy. Source: Grafana data source UI."
  sensitive   = true
}
