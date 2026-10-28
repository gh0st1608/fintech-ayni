locals {
  slo_enabled = var.enabled && var.slo.enabled
}

# El SLO se asocia a la entidad del servicio, que New Relic crea al recibir la primera telemetría.
# Cada ambiente usa su propia cuenta de New Relic, así que el nombre identifica la entidad.
data "newrelic_entity" "service" {
  count = local.slo_enabled ? 1 : 0

  name   = var.service_name
  domain = "EXT"
  type   = "SERVICE"
}

resource "newrelic_service_level" "availability" {
  count = local.slo_enabled ? 1 : 0

  guid        = data.newrelic_entity.service[0].guid
  name        = "${var.name} disponibilidad"
  description = "Peticiones que no responden 5xx."

  events {
    account_id = var.account_id

    valid_events {
      from  = "Span"
      where = local.base_where
    }

    good_events {
      from  = "Span"
      where = "${local.base_where} AND (http.response.status_code IS NULL OR numeric(http.response.status_code) < 500)"
    }
  }

  objective {
    target = var.slo.availability_target

    time_window {
      rolling {
        count = var.slo.rolling_window_days
        unit  = "DAY"
      }
    }
  }
}

resource "newrelic_service_level" "latency" {
  count = local.slo_enabled ? 1 : 0

  guid        = data.newrelic_entity.service[0].guid
  name        = "${var.name} latencia"
  description = "Peticiones que responden en menos de ${var.slo.latency_threshold_ms} ms."

  events {
    account_id = var.account_id

    valid_events {
      from  = "Span"
      where = local.base_where
    }

    good_events {
      from  = "Span"
      where = "${local.base_where} AND duration.ms < ${var.slo.latency_threshold_ms}"
    }
  }

  objective {
    target = var.slo.latency_target

    time_window {
      rolling {
        count = var.slo.rolling_window_days
        unit  = "DAY"
      }
    }
  }
}

# Consumo rápido del presupuesto de error: a este ritmo, el presupuesto del período se agota en
# unos días (14,4 veces la tasa permitida durante 1 hora, recomendación de Google SRE).
resource "newrelic_nrql_alert_condition" "availability_fast_burn" {
  count = local.slo_enabled ? 1 : 0

  policy_id                    = newrelic_alert_policy.this[0].id
  type                         = "static"
  name                         = "${var.name}-slo-fast-burn"
  description                  = "El SLO de disponibilidad consume su presupuesto de error ${var.slo.fast_burn_rate_multiple} veces más rápido de lo permitido."
  runbook_url                  = "${var.runbook_base_url}#slo-fast-burn"
  enabled                      = true
  violation_time_limit_seconds = 86400
  aggregation_window           = 3600
  aggregation_method           = "event_flow"
  aggregation_delay            = 120
  fill_option                  = "none"

  nrql {
    query = "FROM Metric SELECT 100 - clamp_max((sum(newrelic.sli.good) / sum(newrelic.sli.valid)) * 100, 100) WHERE sli.guid = '${newrelic_service_level.availability[0].sli_guid}'"
  }

  critical {
    operator              = "above"
    threshold             = (100 - var.slo.availability_target) * var.slo.fast_burn_rate_multiple
    threshold_duration    = 3600
    threshold_occurrences = "at_least_once"
  }
}
