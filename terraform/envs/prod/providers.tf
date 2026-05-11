terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    # Community-maintained Sentry provider. Used to declare Sentry alert
    # rules + projects alongside AWS resources so the observability config
    # lives in one place and is reviewable in PRs.
    # https://registry.terraform.io/providers/jianyuan/sentry/latest/docs
    sentry = {
      source  = "jianyuan/sentry"
      version = "~> 0.14"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      Env       = var.env
      ManagedBy = "OpenTofu"
    }
  }
}

# Authenticates via the SENTRY_AUTH_TOKEN env var (or `token` attribute,
# but env var keeps it out of state). Set locally before running
# `tofu plan` / `apply`:
#   $env:SENTRY_AUTH_TOKEN = "(1password://...)"   # PowerShell
provider "sentry" {
  # token  = picked up from SENTRY_AUTH_TOKEN env var
  # base_url defaults to https://sentry.io/api/
}
