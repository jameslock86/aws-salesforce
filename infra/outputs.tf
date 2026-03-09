output "api_base_url" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "s3_bucket_name" {
  value = aws_s3_bucket.this.bucket
}

output "rds_endpoint" {
  value = aws_db_instance.this.address
}
