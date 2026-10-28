# Composición completa de prd con un provider simulado: valida el grafo (count/for_each conocidos
# en el plan) y las decisiones del ambiente sin credenciales ni cuenta real.
mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  override_data {
    target = module.network.data.aws_region.current
    values = { region = "us-east-1" }
  }
  override_data {
    target = data.aws_secretsmanager_secret.newrelic_license_key[0]
    values = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ayni-prd/newrelic/license-key-AbCdEf" }
  }
}

mock_provider "newrelic" {}

override_data {
  target = data.aws_kinesis_firehose_delivery_stream.newrelic_logs[0]
  values = { arn = "arn:aws:firehose:us-east-1:123456789012:deliverystream/ayni-prd-newrelic-logs" }
}

override_data {
  target = data.aws_iam_role.newrelic_logs_subscription[0]
  values = { arn = "arn:aws:iam::123456789012:role/ayni-prd-newrelic-logs-subscription" }
}

variables {
  aws_account_id = "123456789012"
  image_tag      = "abc1234"
  new_relic      = { enabled = true, account_id = 1234567 }
}

run "plan_de_prd" {
  command = plan

  assert {
    condition     = module.api.cluster_name == "ayni-prd-api"
    error_message = "Nombres con el prefijo del ambiente."
  }

  assert {
    condition     = length(module.network.private_subnet_ids) == 2 && module.network.has_private_egress
    error_message = "Tareas en subredes privadas con salida por NAT."
  }

  assert {
    condition     = output.api_url == "https://backend-ayni.solutionserj.com"
    error_message = "La API se publica solo por HTTPS en su dominio."
  }
}

# Controles que dependen de variables (checkov los marca porque también evalúa dev).
run "controles_de_prd" {
  command = plan

  assert {
    condition = alltrue([
      module.database.settings.multi_az,
      module.database.settings.deletion_protection,
      module.database.settings.performance_insights_enabled,
      module.database.settings.monitoring_interval == 60,
      module.database.settings.backup_retention_days == 30,
    ])
    error_message = "Base de datos Multi-AZ, protegida, con Performance Insights, Enhanced Monitoring y 30 días de backups."
  }

  assert {
    condition     = module.api.settings.alb_deletion_protection && !module.api.settings.assign_public_ip
    error_message = "ALB protegido contra borrado y tareas sin IP pública."
  }

  assert {
    condition     = module.api.settings.https_enabled && module.api.settings.waf_enabled
    error_message = "HTTPS con redirección desde HTTP y WAF asociado."
  }
}

run "rechaza_la_cuenta_de_ejemplo" {
  command = plan

  variables {
    aws_account_id = "000000000000"
  }

  expect_failures = [var.aws_account_id]
}

run "rechaza_etiquetas_que_no_son_un_sha" {
  command = plan

  variables {
    image_tag = "latest"
  }

  expect_failures = [var.image_tag]
}

# New Relic como lugar principal; CloudWatch de respaldo; dominio delegado a Route 53.
run "observabilidad_y_dominio" {
  command = plan

  assert {
    condition     = toset(keys(module.observability.alarm_arns)) == toset(["api-unhealthy-targets", "db-storage-low"])
    error_message = "CloudWatch queda solo con las alarmas de respaldo."
  }

  assert {
    condition = alltrue([for condition in [
      "ayni-prd-api-api-error-rate", "ayni-prd-api-api-latency-p95", "ayni-prd-api-synthetics-health", # gitleaks:allow (nombres de alarmas, no claves)
      "ayni-prd-api-api-cpu-high", "ayni-prd-api-db-storage-low",
    ] : contains(module.newrelic.condition_names, condition)])
    error_message = "New Relic tiene las condiciones de la API, el monitor sintético y la infraestructura."
  }

  assert {
    condition     = aws_route53_zone.api.name == "backend-ayni.solutionserj.com"
    error_message = "Zona delegada para el subdominio de la API."
  }

  assert {
    condition     = length(module.logs_to_newrelic) == 1
    error_message = "Los logs de WAF, PostgreSQL y flow logs se reenvían a New Relic."
  }
}

run "sin_new_relic" {
  command = plan

  variables {
    new_relic = { enabled = false, account_id = 0 }
  }

  assert {
    condition     = length(module.logs_to_newrelic) == 0 && module.newrelic.policy_id == null
    error_message = "Sin New Relic no se crea nada en New Relic ni se reenvían logs."
  }
}
