locals {
  # Un ARN de Secrets Manager con clave JSON (…:secret:nombre:clave::) se reduce al del secreto.
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

# Rol de ejecución: lo usa ECS para descargar la imagen, escribir logs y leer los secretos.
resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# El count usa las claves (conocidas en el plan), no los ARN (pueden conocerse recién en el apply).
data "aws_iam_policy_document" "read_secrets" {
  count = length(var.secrets) > 0 ? 1 : 0

  statement {
    actions = ["secretsmanager:GetSecretValue", "ssm:GetParameters"]
    # Solo los secretos que usa la tarea.
    resources = local.secret_resource_arns
  }
}

resource "aws_iam_role_policy" "read_secrets" {
  count = length(var.secrets) > 0 ? 1 : 0

  name   = "read-task-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets[0].json
}

# Rol de la tarea: los permisos de la aplicación.
resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "task" {
  for_each = var.task_policies

  name   = each.key
  role   = aws_iam_role.task.id
  policy = each.value
}
