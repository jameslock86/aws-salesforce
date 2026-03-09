resource "aws_secretsmanager_secret" "db" {
  name = "${local.name}/db"
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id

  secret_string = jsonencode({
    host     = aws_db_instance.this.address
    dbname   = var.db_name
    username = var.db_username
    password = var.db_password
    port     = 3306
  })
}

