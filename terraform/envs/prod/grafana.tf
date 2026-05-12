# Grafana Cloud — cross-account IAM role for CloudWatch data source (pull).
#
# Architecture: Grafana Cloud (their AWS account) calls sts:AssumeRole on a
# role in *our* account. The role grants read-only access to CloudWatch
# metrics + Logs + a handful of discovery APIs (EC2 regions, Resource
# Groups Tagging). Grafana then queries CloudWatch on demand when a
# dashboard panel loads.
#
# Decision recorded in agentic-dev-environment ADR-0014: pull pattern over
# CloudWatch Metric Streams (push). Pull is the industry default at our
# scale; push is reserved for sub-minute SRE/on-call needs we don't have.
#
# Trust policy hardening:
#   - Principal: Grafana's published AWS account ID for the Grafana Cloud
#     stack region (008923505280). Public knowledge; not a secret.
#   - sts:ExternalId condition: per-stack secret (1631481) shown only inside
#     our Grafana Cloud UI. Closes the confused-deputy hole: another customer
#     of Grafana Cloud can't trick Grafana into assuming OUR role on their
#     behalf, because they don't know our external ID.
#
# Permissions: minimum set documented by Grafana for the CloudWatch data
# source. https://grafana.com/docs/grafana/latest/datasources/aws-cloudwatch/aws-authentication/
# All actions are read-only; resource scope is "*" because CloudWatch's
# metric/log APIs do not support resource-level IAM (the actions are
# inherently account-wide reads).

# ── Trust policy: who can assume this role ─────────────────────────────────
data "aws_iam_policy_document" "grafana_cloudwatch_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::008923505280:root"]
    }

    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = ["1631481"]
    }
  }
}

# ── Permissions policy: read-only CloudWatch + Logs + discovery ────────────
data "aws_iam_policy_document" "grafana_cloudwatch_readonly" {
  # CloudWatch metrics — read alarms, metrics, and metric data.
  statement {
    sid    = "CloudWatchMetricsRead"
    effect = "Allow"
    actions = [
      "cloudwatch:DescribeAlarmsForMetric",
      "cloudwatch:DescribeAlarmHistory",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:ListMetrics",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:GetInsightRuleReport",
    ]
    resources = ["*"]
  }

  # CloudWatch Logs — query log groups via Logs Insights + raw GetLogEvents.
  statement {
    sid    = "CloudWatchLogsRead"
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:GetLogGroupFields",
      "logs:StartQuery",
      "logs:StopQuery",
      "logs:GetQueryResults",
      "logs:GetLogEvents",
    ]
    resources = ["*"]
  }

  # EC2 — used by Grafana to enumerate available regions and resolve
  # instance-level tags when building dashboards. Not used by us today
  # (serverless stack) but cheap to include and unblocks future EC2 work.
  statement {
    sid    = "Ec2Discovery"
    effect = "Allow"
    actions = [
      "ec2:DescribeRegions",
      "ec2:DescribeInstances",
      "ec2:DescribeTags",
    ]
    resources = ["*"]
  }

  # Resource Groups Tagging API — Grafana uses this to discover what
  # resources exist in the account so panel templating can offer them
  # as dropdown variables (e.g. "pick a Lambda function").
  statement {
    sid    = "TagDiscovery"
    effect = "Allow"
    actions = [
      "tag:GetResources",
      "tag:GetTagKeys",
      "tag:GetTagValues",
    ]
    resources = ["*"]
  }
}

# ── The role itself ────────────────────────────────────────────────────────
resource "aws_iam_role" "grafana_cloudwatch" {
  name               = "grafana-cloudwatch-readonly"
  assume_role_policy = data.aws_iam_policy_document.grafana_cloudwatch_trust.json
  description        = "Assumed by Grafana Cloud (account 008923505280) to query CloudWatch metrics + Logs for the game-night-pwa observability dashboards. External ID required."
}

resource "aws_iam_role_policy" "grafana_cloudwatch_readonly" {
  name   = "cloudwatch-readonly"
  role   = aws_iam_role.grafana_cloudwatch.id
  policy = data.aws_iam_policy_document.grafana_cloudwatch_readonly.json
}

# ── Output the ARN so we can paste it into the Grafana data source UI ──────
output "grafana_cloudwatch_role_arn" {
  description = "Paste this into the Grafana Cloud CloudWatch data source's Assume Role ARN field."
  value       = aws_iam_role.grafana_cloudwatch.arn
}
