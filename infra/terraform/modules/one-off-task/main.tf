# Tarea ECS que se lanza a mano o desde el pipeline y termina: no hay servicio ni schedule detrás.
# La usan las migraciones, que corren antes de actualizar el servicio (ADR 2, COPAYNI-12).
#
# Cluster y grupo de logs propios, y no los del servicio, por una razón de orden: el despliegue
# aplica primero esta tarea y migra, y solo después actualiza la API. Si la tarea dependiera del
# servicio, aplicarla arrastraría al servicio y la API se actualizaría antes de migrar. Un cluster
# de ECS no cuesta nada.

data "aws_region" "current" {}

resource "aws_ecs_cluster" "this" {
  name = var.name
  tags = var.tags

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name                   = "task"
      image                  = var.image
      command                = var.command
      essential              = true
      readonlyRootFilesystem = true

      environment = [
        for key in sort(keys(var.environment)) : { name = key, value = var.environment[key] }
      ]
      secrets = [
        for key in sort(keys(var.secrets)) : { name = key, valueFrom = var.secrets[key] }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this.name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = var.name
        }
      }
    }
  ])

  tags = var.tags
}
