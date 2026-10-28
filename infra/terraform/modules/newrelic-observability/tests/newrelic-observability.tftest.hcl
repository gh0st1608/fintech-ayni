mock_provider "newrelic" {
  mock_data "newrelic_entity" {
    defaults = { guid = "MTIzNDU2N3xFWFR8U0VSVklDRXwx" }
  }
}

variables {
  name             = "ayni-test-api"
  account_id       = 1234567
  service_name     = "ayni-api"
  environment      = "prod"
  runbook_base_url = "https://example.com/runbook"
}

run "condiciones_de_la_api" {
  command = plan

  assert {
    condition     = toset(keys(newrelic_nrql_alert_condition.api)) == toset(["api-error-rate", "api-latency-p95"]) # gitleaks:allow (nombres de alarmas, no claves)
    error_message = "Errores y latencia de la API, desde los spans."
  }

  assert {
    condition     = strcontains(newrelic_nrql_alert_condition.api["api-error-rate"].nrql[0].query, "deployment.environment.name = 'prod'")
    error_message = "Las consultas filtran por ambiente."
  }

  assert {
    condition     = newrelic_nrql_alert_condition.api["api-latency-p95"].runbook_url == "https://example.com/runbook#api-latency-p95"
    error_message = "Cada condición enlaza a su runbook."
  }

  assert {
    condition     = length(newrelic_workflow.this) == 0 && length(newrelic_one_dashboard.this) == 1
    error_message = "Sin correos no hay workflow; el dashboard se crea igual."
  }

  assert {
    condition     = length(newrelic_service_level.availability) == 0 && length(newrelic_synthetics_monitor.health) == 0 && length(newrelic_nrql_alert_condition.infra) == 0
    error_message = "SLO, monitor sintético e infraestructura son opcionales."
  }
}

run "completo" {
  command = plan

  variables {
    notification_emails = ["guardia@example.com"]
    slo                 = { enabled = true }
    synthetics          = { url = "https://api.example.com/health/live" }
    aws_infra = {
      ecs_cluster_name       = "c"
      ecs_service_name       = "s"
      alb_arn_suffix         = "app/lb/1"
      db_instance_identifier = "db"
    }
  }

  assert {
    condition     = length(newrelic_workflow.this) == 1
    error_message = "Con correos, el workflow notifica los issues de la política."
  }

  assert {
    condition     = one(newrelic_service_level.availability[0].objective).target == 99.9 && one(newrelic_service_level.latency[0].objective).target == 99
    error_message = "SLO iniciales: 99,9 % de disponibilidad y 99 % bajo el umbral de latencia."
  }

  assert {
    condition     = abs(newrelic_nrql_alert_condition.availability_fast_burn[0].critical[0].threshold - 1.44) < 0.0001
    error_message = "Consumo rápido: 14,4 veces el presupuesto de error (0,1 %)."
  }

  assert {
    condition     = newrelic_synthetics_monitor.health[0].verify_ssl && newrelic_synthetics_monitor.health[0].uri == "https://api.example.com/health/live"
    error_message = "El monitor llama al health check por HTTPS y verifica el certificado."
  }

  assert {
    condition     = length(newrelic_nrql_alert_condition.infra) == 5
    error_message = "CPU y memoria del servicio, targets no sanos, CPU y almacenamiento de la base de datos."
  }

  assert {
    condition     = newrelic_nrql_alert_condition.infra["db-storage-low"].critical[0].operator == "below"
    error_message = "El almacenamiento alarma por debajo del umbral."
  }

  assert {
    condition     = length(newrelic_one_dashboard.this[0].page) == 2
    error_message = "Dashboard con páginas de API e infraestructura."
  }
}

run "desactivado" {
  command = plan

  variables {
    enabled    = false
    synthetics = { url = "https://api.example.com/health/live" }
  }

  assert {
    condition     = length(newrelic_alert_policy.this) == 0 && length(newrelic_one_dashboard.this) == 0 && length(newrelic_synthetics_monitor.health) == 0
    error_message = "enabled = false no crea nada en New Relic."
  }
}

run "rechaza_ventana_de_slo_invalida" {
  command = plan

  variables {
    slo = { enabled = true, rolling_window_days = 30 }
  }

  expect_failures = [var.slo]
}
