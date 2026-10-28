locals {
  synthetics_enabled = var.enabled && var.synthetics != null
}

# Llama al health check desde afuera, como un cliente: detecta fallas de DNS, certificado o
# balanceador que las métricas internas no ven.
resource "newrelic_synthetics_monitor" "health" {
  count = local.synthetics_enabled ? 1 : 0

  name             = "${var.name}-health"
  type             = "SIMPLE"
  status           = "ENABLED"
  period           = var.synthetics.period
  uri              = var.synthetics.url
  locations_public = var.synthetics.locations
  verify_ssl       = true
}

resource "newrelic_nrql_alert_condition" "synthetics" {
  count = local.synthetics_enabled ? 1 : 0

  policy_id                    = newrelic_alert_policy.this[0].id
  type                         = "static"
  name                         = "${var.name}-synthetics-health"
  description                  = "El health check falla desde internet en más de una ubicación."
  runbook_url                  = "${var.runbook_base_url}#synthetics-health"
  enabled                      = true
  violation_time_limit_seconds = 86400
  aggregation_window           = 300
  aggregation_method           = "event_flow"
  aggregation_delay            = 60
  fill_option                  = "none"

  nrql {
    query = "SELECT uniqueCount(location) FROM SyntheticCheck WHERE monitorName = '${newrelic_synthetics_monitor.health[0].name}' AND result = 'FAILED'"
  }

  critical {
    operator              = "above"
    threshold             = 1
    threshold_duration    = 600
    threshold_occurrences = "all"
  }
}
