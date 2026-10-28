mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
}

mock_provider "newrelic" {}

variables {
  name                   = "ayni-test"
  newrelic_account_id    = 1234567
  license_key_secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ayni-test/newrelic/license-key-AbCdEf"
}

run "metricas_y_logs_a_new_relic_us" {
  command = plan

  assert {
    condition     = aws_kinesis_firehose_delivery_stream.this["metrics"].http_endpoint_configuration[0].url == "https://aws-api.newrelic.com/cloudwatch-metrics/v1"
    error_message = "Métricas al endpoint US."
  }

  assert {
    condition     = aws_kinesis_firehose_delivery_stream.this["logs"].http_endpoint_configuration[0].url == "https://aws-api.newrelic.com/firehose/v1"
    error_message = "Logs al endpoint US."
  }

  assert {
    condition = alltrue([
      for stream in aws_kinesis_firehose_delivery_stream.this :
      stream.http_endpoint_configuration[0].secrets_manager_configuration[0].enabled && stream.http_endpoint_configuration[0].access_key == null
    ])
    error_message = "La license key se lee de Secrets Manager: nunca pasa por el estado."
  }

  assert {
    condition     = aws_kinesis_firehose_delivery_stream.this["logs"].http_endpoint_configuration[0].buffering_size == 1
    error_message = "Buffer de 1 MiB: la Logs API rechaza envíos de más de 1 MB."
  }

  assert {
    condition     = aws_cloudwatch_metric_stream.this.output_format == "opentelemetry1.0"
    error_message = "Metric stream en OpenTelemetry 1.0."
  }

  assert {
    condition     = newrelic_cloud_aws_link_account.this.metric_collection_mode == "PUSH"
    error_message = "Vínculo por metric streams (PUSH)."
  }

  assert {
    condition     = startswith(aws_iam_role.newrelic.name, "ayni-test-") && startswith(aws_iam_role.firehose.name, "ayni-test-")
    error_message = "Los roles llevan el prefijo del stack: el rol de apply solo administra <name>-*."
  }
}

run "region_eu_sin_logs" {
  command = plan

  variables {
    newrelic_region = "EU"
    logs_enabled    = false
  }

  assert {
    condition     = aws_kinesis_firehose_delivery_stream.this["metrics"].http_endpoint_configuration[0].url == "https://aws-api.eu01.nr-data.net/cloudwatch-metrics/v1"
    error_message = "Métricas al endpoint EU."
  }

  assert {
    condition     = length(aws_kinesis_firehose_delivery_stream.this) == 1 && length(aws_iam_role.logs_subscription) == 0
    error_message = "Sin logs: un solo Firehose y sin rol de suscripción."
  }
}

run "rechaza_region_desconocida" {
  command = plan

  variables {
    newrelic_region = "JP"
  }

  expect_failures = [var.newrelic_region]
}
