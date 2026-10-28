mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name             = "ayni-test-api"
  ecs              = { cluster_name = "c", service_name = "s" }
  alb              = { arn_suffix = "app/lb/1", target_group_arn_suffix = "targetgroup/tg/1" }
  runbook_base_url = "https://example.com/runbook"
}

run "alarmas_de_la_api_con_runbook" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.simple) == 3 && length(aws_sns_topic.this) == 1
    error_message = "Sin base de datos: CPU, memoria y targets no sanos, más el tópico propio."
  }

  assert {
    condition     = alltrue([for alarm in aws_cloudwatch_metric_alarm.simple : strcontains(alarm.alarm_description, "Runbook: https://example.com/runbook#")])
    error_message = "Cada alarma enlaza a su runbook."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.latency_p95[0].threshold == 0.8
    error_message = "El umbral de latencia se convierte de ms a segundos."
  }
}

run "alarmas_de_base_de_datos" {
  command = plan

  variables {
    db_instance_identifier = "ayni-test"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.simple) == 5
    error_message = "Con base de datos se agregan CPU y almacenamiento."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.simple["db-storage-low"].threshold == 5 * 1024 * 1024 * 1024
    error_message = "El umbral de almacenamiento se convierte de GB a bytes."
  }
}

run "topico_existente" {
  command = plan

  variables {
    notification_topic_arn = "arn:aws:sns:us-east-1:123456789012:alarms"
  }

  assert {
    condition     = length(aws_sns_topic.this) == 0
    error_message = "Con un tópico existente no se crea otro."
  }
}

run "desactivado" {
  command = plan

  variables {
    enabled = false
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.simple) == 0 && length(aws_sns_topic.this) == 0
    error_message = "enabled = false no crea nada."
  }
}

run "solo_respaldo" {
  command = plan

  variables {
    db_instance_identifier = "ayni-test"
    alarm_names            = ["api-unhealthy-targets", "db-storage-low"]
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.simple)) == toset(["api-unhealthy-targets", "db-storage-low"])
    error_message = "Solo las alarmas de respaldo elegidas."
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.latency_p95) == 0 && length(aws_cloudwatch_metric_alarm.error_rate) == 0
    error_message = "Latencia y errores quedan en New Relic."
  }
}

run "rechaza_alarmas_desconocidas" {
  command = plan

  variables {
    alarm_names = ["api-otra"]
  }

  expect_failures = [var.alarm_names]
}
