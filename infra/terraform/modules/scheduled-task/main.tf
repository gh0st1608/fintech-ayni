data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name                   = "job"
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
          awslogs-group         = var.log_group_name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = var.name
        }
      }
    }
  ])

  tags = var.tags
}

# Los reintentos son seguros solo si el job es idempotente (ADR, Tareas programadas).
resource "aws_scheduler_schedule" "this" {
  name                         = var.name
  state                        = var.enabled ? "ENABLED" : "DISABLED"
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.this.arn
      launch_type         = "FARGATE"
      task_count          = 1

      network_configuration {
        subnets          = var.subnet_ids
        security_groups  = var.security_group_ids
        assign_public_ip = var.assign_public_ip
      }
    }

    retry_policy {
      maximum_retry_attempts       = var.maximum_retry_attempts
      maximum_event_age_in_seconds = 3600
    }

    dead_letter_config {
      arn = aws_sqs_queue.failures.arn
    }
  }
}

# Una sola cola con las dos formas de fallar: el scheduler no pudo lanzar la tarea (dead letter) o
# la tarea terminó mal (regla de abajo). EventBridge Scheduler no ve el código de salida del job.
resource "aws_sqs_queue" "failures" {
  name                      = "${var.name}-failures"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

resource "aws_cloudwatch_event_rule" "task_failed" {
  name        = "${var.name}-failed"
  description = "La tarea ${var.name} terminó con error o no llegó a arrancar"

  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Task State Change"]
    detail = {
      clusterArn = [var.cluster_arn]
      group      = ["family:${var.name}"]
      lastStatus = ["STOPPED"]
      "$or" = [
        { containers = { exitCode = [{ "anything-but" = 0 }] } },
        { stopCode = ["TaskFailedToStart"] },
      ]
    }
  })

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "task_failed" {
  rule = aws_cloudwatch_event_rule.task_failed.name
  arn  = aws_sqs_queue.failures.arn
}

resource "aws_sqs_queue_policy" "failures" {
  queue_url = aws_sqs_queue.failures.id
  policy    = data.aws_iam_policy_document.failures_queue.json
}

resource "aws_cloudwatch_metric_alarm" "failed" {
  # count con el flag y no con el ARN: el tópico puede conocerse recién en el apply.
  count = var.alarm_enabled ? 1 : 0

  alarm_name          = "${var.name}-failed"
  alarm_description   = "La tarea programada ${var.name} falló. Los detalles están en la cola ${aws_sqs_queue.failures.name} y en ${var.log_group_name}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.failures.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags
}
