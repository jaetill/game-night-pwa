# Remote state per platform Standard 08 / ADR-0007.
#
# State backend bootstrapped via the platform's bootstrap-tfstate.sh on
# 2026-05-10:
#   bucket         = "jaetill-tfstate"
#   region         = "us-east-2"
#   dynamodb_table = "terraform-state-lock"
#
# State key pattern: <project>/<env>/terraform.tfstate

terraform {
  required_version = ">= 1.6"

  backend "s3" {
    bucket         = "jaetill-tfstate"
    key            = "game-night-pwa/prod/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
