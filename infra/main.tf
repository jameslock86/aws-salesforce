locals {
  name = var.project
  tags = {
    Project = var.project
  }
}


resource "aws_apigatewayv2_route" "db_tables" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /db/tables"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "db_counts" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /db/counts"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
