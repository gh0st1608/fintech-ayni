mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
}

variables {
  name                    = "ayni-test"
  data_event_bucket_names = ["ayni-test-documents"]
  trusted_role_names      = ["ayni-test-terraform-apply"]
  runbook_base_url        = "https://example.com/security"
}

run "trail_integro_y_multi_region" {
  command = plan

  assert {
    condition     = aws_cloudtrail.this.is_multi_region_trail && aws_cloudtrail.this.enable_log_file_validation && aws_cloudtrail.this.include_global_service_events
    error_message = "Trail multi-región, con validación de integridad y eventos globales."
  }

  assert {
    condition     = aws_s3_bucket.this.bucket == "ayni-test-cloudtrail-123456789012"
    error_message = "El bucket lleva la cuenta en el nombre (único global)."
  }

  assert {
    condition     = length(aws_cloudtrail.this.advanced_event_selector) == 2
    error_message = "Eventos de gestión más accesos a los documentos KYC."
  }

  assert {
    condition = contains(
      flatten([for selector in aws_cloudtrail.this.advanced_event_selector : [for field in selector.field_selector : coalesce(field.starts_with, [])]]),
      "arn:aws:s3:::ayni-test-documents/"
    )
    error_message = "Los data events cubren los objetos del bucket de documentos."
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.this.rule[0].expiration[0].days == 365
    error_message = "Un año de retención en S3 por defecto."
  }
}

run "alarmas_de_seguridad" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.security) == 7 && length(aws_sns_topic.this) == 1
    error_message = "Siete alarmas CIS y el tópico propio."
  }

  assert {
    condition     = strcontains(aws_cloudwatch_log_metric_filter.security["iam-policy-changes"].pattern, "sessionIssuer.userName != \"ayni-test-terraform-apply\"")
    error_message = "Los cambios del rol de apply no alarman."
  }

  assert {
    condition     = !strcontains(aws_cloudwatch_log_metric_filter.security["root-account-usage"].pattern, "ayni-test-terraform-apply")
    error_message = "El uso de root alarma siempre, sin excepciones."
  }

  assert {
    condition     = alltrue([for alarm in aws_cloudwatch_metric_alarm.security : strcontains(alarm.alarm_description, "Runbook: https://example.com/security#")])
    error_message = "Cada alarma enlaza a su runbook."
  }
}

run "sin_data_events_ni_alarmas" {
  command = plan

  variables {
    data_event_bucket_names = []
    security_alarms_enabled = false
  }

  assert {
    condition     = length(aws_cloudtrail.this.advanced_event_selector) == 1
    error_message = "Sin buckets, solo eventos de gestión."
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.security) == 0 && length(aws_sns_topic.this) == 0
    error_message = "Sin alarmas no se crea el tópico."
  }
}

run "rechaza_retencion_corta" {
  command = plan

  variables {
    s3_retention_days = 30
  }

  expect_failures = [var.s3_retention_days]
}
