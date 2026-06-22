# DynamoDB table for distributed rate limiting on the public /feedback endpoint.
# Each item key encodes the source IP and the hour-aligned window start, so a
# new window is a new item — no explicit reset needed. TTL is set to 2 × window
# so DynamoDB's async sweeper handles cleanup.

resource "aws_dynamodb_table" "feedback_rate_limits" {
  name         = "game-night-feedback-rl"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
