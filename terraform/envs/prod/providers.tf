terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.aws_region

  # default_tags is intentionally omitted during the Phase 6 retrofit so that
  # `tofu plan` shows zero diff against the existing untagged AWS resources.
  # Once all resources are imported, a separate commit will re-introduce
  # default_tags and apply the tag-all-resources change as a single reviewable
  # diff. See terraform/envs/prod/main.tf for the retrofit playbook.
  #
  # default_tags {
  #   tags = {
  #     Project   = var.project_name
  #     Env       = var.env
  #     ManagedBy = "OpenTofu"
  #   }
  # }
}
