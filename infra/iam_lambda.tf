resource "aws_security_group" "lambda_sg" {
  name   = "${local.name}-lambda-sg"
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.name}-lambda-sg" })
}

resource "aws_iam_role" "lambda_role" {
  name = "${local.name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "vpc_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "s3_access" {
  name = "${local.name}-lambda-s3"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["s3:GetObject", "s3:PutObject"],
        Resource = "${aws_s3_bucket.this.arn}/*"
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name}-api"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 20

  filename         = "${path.module}/../lambda/function.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambda/function.zip")

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  #   environment {
  #   variables = {
  #     DB_HOST    = aws_db_instance.this.address
  #     DB_NAME    = var.db_name
  #     DB_USER    = var.db_username
  #     DB_PASS    = var.db_password
  #     BUCKET     = aws_s3_bucket.this.bucket
  #     APP_REGION = var.aws_region
  #   }
  # }

  environment {
    variables = {
      DB_SECRET_ARN = aws_secretsmanager_secret.db.arn
      BUCKET        = aws_s3_bucket.this.bucket
      APP_REGION    = var.aws_region
      ADMIN_TOKEN   = var.admin_token
    }
  }




  tags = local.tags

  depends_on = [aws_db_instance.this]
}

resource "aws_iam_role_policy" "secrets_access" {
  name = "${local.name}-lambda-secrets"
  role = aws_iam_role.lambda_role.id


  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["secretsmanager:GetSecretValue"],
      Resource = aws_secretsmanager_secret.db.arn
    }]
  })
}
resource "aws_iam_role_policy" "lambda_s3_read_salesforce" {
  name = "apigw-rds-demo-lambda-s3-read-salesforce"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ListBucketForSalesforcePrefix"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.this.arn]
        Condition = {
          StringLike = {
          "s3:prefix" = [
  "salesforce/raw/leads/",
  "salesforce/raw/leads/*",
  "salesforce/raw/accounts/",
  "salesforce/raw/accounts/*"
]
          }
        }
      },
      {
        Sid    = "GetObjectsForSalesforcePrefix"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "${aws_s3_bucket.this.arn}/salesforce/raw/leads/*",
          "${aws_s3_bucket.this.arn}/salesforce/raw/accounts/*"
        ]
      }
    ]
  })
}