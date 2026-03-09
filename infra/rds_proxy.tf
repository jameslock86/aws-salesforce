resource "aws_iam_role" "rds_proxy_role" {
  name = "${local.name}-rds-proxy-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "rds.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "rds_proxy_secrets" {
  name = "${local.name}-rds-proxy-secrets"
  role = aws_iam_role.rds_proxy_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["secretsmanager:GetSecretValue"],
        Resource = aws_secretsmanager_secret.db.arn
      }
    ]
  })
}

resource "aws_security_group" "rds_proxy_sg" {
  name   = "${local.name}-rds-proxy-sg"
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.name}-rds-proxy-sg" })
}

# Allow Lambda -> RDS Proxy
resource "aws_security_group_rule" "proxy_from_lambda" {
  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds_proxy_sg.id
  source_security_group_id = aws_security_group.lambda_sg.id
}

# Allow RDS Proxy -> RDS
resource "aws_security_group_rule" "rds_from_proxy" {
  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds_sg.id
  source_security_group_id = aws_security_group.rds_proxy_sg.id
}

resource "aws_db_proxy" "this" {
  name                   = "${local.name}-proxy"
  engine_family          = "MYSQL"
  role_arn               = aws_iam_role.rds_proxy_role.arn
  vpc_subnet_ids         = aws_subnet.private[*].id
  vpc_security_group_ids = [aws_security_group.rds_proxy_sg.id]

  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_secretsmanager_secret.db.arn
    iam_auth    = "DISABLED"
  }

  require_tls = true
  tags        = local.tags
}
resource "aws_db_proxy_default_target_group" "this" {
  db_proxy_name = aws_db_proxy.this.name

  connection_pool_config {
    max_connections_percent      = 80
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "this" {
  db_proxy_name          = aws_db_proxy.this.name
  target_group_name      = aws_db_proxy_default_target_group.this.name
  db_instance_identifier = aws_db_instance.this.identifier
}

