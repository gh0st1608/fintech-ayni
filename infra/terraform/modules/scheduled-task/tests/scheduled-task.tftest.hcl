mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:ayni-test-job-failures" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/ayni-test-job-scheduler" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn                  = "arn:aws:ecs:us-east-1:123456789012:task-definition/ayni-test-job:1"
      arn_without_revision = "arn:aws:ecs:us-east-1:123456789012:task-definition/ayni-test-job"
    }
  }
}

variables {
  name                = "ayni-test-job"
  schedule_expression = "cron(0 6 * * ? *)"
  schedule_timezone   = "America/Lima"
  cluster_arn         = "arn:aws:ecs:us-east-1:123456789012:cluster/ayni-test-api"
  image               = "123456789012.dkr.ecr.us-east-1.amazonaws.com/ayni/api:abc1234"
  command             = ["node", "dist/jobs/circle-cycle.js"]
  environment         = { NODE_ENV = "production" }
  execution_role_arn  = "arn:aws:iam::123456789012:role/execution"
  task_role_arn       = "arn:aws:iam::123456789012:role/task"
  log_group_name      = "/ecs/ayni-test-api"
  subnet_ids          = ["subnet-a"]
  security_group_ids  = ["sg-a"]
}

run "habilitado_por_defecto" {
  command = plan

  assert {
    condition     = aws_scheduler_schedule.this.state == "ENABLED"
    error_message = "El schedule queda habilitado por defecto."
  }

  assert {
    condition     = aws_scheduler_schedule.this.schedule_expression_timezone == "America/Lima"
    error_message = "La expresión usa la zona horaria indicada."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].command[1] == "dist/jobs/circle-cycle.js"
    error_message = "La tarea corre el comando del job."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].readonlyRootFilesystem
    error_message = "El contenedor corre con el sistema de archivos de solo lectura."
  }

  assert {
    condition     = aws_scheduler_schedule.this.flexible_time_window[0].mode == "OFF"
    error_message = "La tarea corre a la hora exacta."
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.failed) == 0
    error_message = "Sin alarm_enabled no se crea la alarma."
  }
}

run "falla_detectada_por_codigo_de_salida" {
  command = plan

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_failed.event_pattern).detail.group[0] == "family:ayni-test-job"
    error_message = "La regla mira solo las tareas de este job."
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_failed.event_pattern).detail["$or"][0].containers.exitCode[0]["anything-but"] == 0
    error_message = "La regla captura cualquier código de salida distinto de 0."
  }
}

run "deshabilitado_con_alarma" {
  command = plan

  variables {
    enabled         = false
    alarm_enabled   = true
    alarm_topic_arn = "arn:aws:sns:us-east-1:123456789012:alertas"
  }

  assert {
    condition     = aws_scheduler_schedule.this.state == "DISABLED"
    error_message = "enabled = false crea el schedule deshabilitado."
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.failed) == 1
    error_message = "Con alarm_enabled se crea la alarma."
  }
}

run "expresion_invalida" {
  command = plan

  variables {
    schedule_expression = "todos los días"
  }

  expect_failures = [var.schedule_expression]
}
