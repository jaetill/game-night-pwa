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
