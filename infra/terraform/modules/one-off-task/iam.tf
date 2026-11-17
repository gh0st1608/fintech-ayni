locals {
  # Un ARN con clave JSON (…:secret:nombre:clave::) se reduce al del secreto.
  secret_resource_arns = distinct([
    for arn in values(var.secrets) :
    can(regex("^arn:aws[a-z-]*:secretsmanager:", arn)) ? join(":", slice(split(":", arn), 0, 7)) : arn
  ])
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Rol propio y no el del servicio: la migración lee la credencial maestra de la base, que la API
# no debe poder leer nunca (COPAYNI-12).
resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  description        = "Rol de ejecución de la tarea ${var.name}"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  count = length(var.secrets) > 0 ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue", "ssm:GetParameters"]
    resources = local.secret_resource_arns
  }
}

resource "aws_iam_role_policy" "read_secrets" {
  count = length(var.secrets) > 0 ? 1 : 0

  name   = "read-task-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets[0].json
}
