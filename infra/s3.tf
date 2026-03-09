resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "this" {
  bucket = "${local.name}-${random_id.suffix.hex}"
  tags   = merge(local.tags, { Name = "${local.name}-bucket" })
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_cors_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_origins = [
      "http://localhost:3000",
      "https://nextjs-boilerplate-o94dvu881-jameslock86s-projects.vercel.app"
    ]

    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_headers = ["*"]

    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

