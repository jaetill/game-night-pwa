# S3 bucket: jaetill-game-nights
#
# Stores:
#   gameNights.json                   — master list of all game night events
#   profiles/{userId}.json            — user profiles
#   collections/{userId}.json         — BGG collections (userId = Cognito username)
#
# All writes happen through Lambdas; the frontend never touches S3 directly.
# Reads use presigned URLs issued by GeneratePresignedGetUrl.

resource "aws_s3_bucket" "game_nights" {
  bucket = "jaetill-game-nights"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "game_nights" {
  bucket = aws_s3_bucket.game_nights.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "game_nights" {
  bucket = aws_s3_bucket.game_nights.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "game_nights" {
  bucket = aws_s3_bucket.game_nights.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_cors_configuration" "game_nights" {
  bucket = aws_s3_bucket.game_nights.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "POST", "PUT"]
    allowed_origins = [
      "https://gamenight.jaetill.com",  # legacy singular hostname; kept for old links
      "https://gamenights.jaetill.com",
      "https://jaetill.github.io",
    ]
    max_age_seconds = 3000
  }
}
