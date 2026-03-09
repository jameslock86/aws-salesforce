resource "aws_apigatewayv2_route" "migrate" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /migrate"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}


resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name}-http"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["http://localhost:3000", "https://nextjs-boilerplate-o94dvu881-jameslock86s-projects.vercel.app"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "x-admin-token"]
    max_age       = 3600
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "items" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /items"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "upload_url" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /upload-url"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
resource "aws_apigatewayv2_route" "tcp_check" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /tcp-check"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_route" "seed_leads" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /seed/leads"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_route" "db_sample" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /db/sample"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_route" "seed_accounts" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /seed/accounts"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_route" "link_leads_accounts" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /link/leads-to-accounts"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_route" "link_converted" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /link/leads-to-accounts-converted"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
resource "aws_apigatewayv2_route" "import_csv" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /import/csv"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}
resource "aws_apigatewayv2_route" "sf_leads" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /sf/leads"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}