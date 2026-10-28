locals {
  # Spans de servidor de la API (OpenTelemetry): una petición HTTP = un span. /health no se traza.
  base_where = "service.name = '${var.service_name}' AND deployment.environment.name = '${var.environment}' AND span.kind = 'server'"
  is_error   = "numeric(http.response.status_code) >= 500"

  notify = var.enabled && length(var.notification_emails) > 0
}

resource "newrelic_alert_policy" "this" {
  count = var.enabled ? 1 : 0

  name                = var.name
  incident_preference = "PER_CONDITION_AND_TARGET"
}

# --- Notificaciones: un workflow manda los issues de la política al destino.
resource "newrelic_notification_destination" "email" {
  count = local.notify ? 1 : 0

  name = "${var.name}-email"
  type = "EMAIL"

  property {
    key   = "email"
    value = join(",", var.notification_emails)
  }
}

resource "newrelic_notification_channel" "email" {
  count = local.notify ? 1 : 0

  name           = "${var.name}-email"
  type           = "EMAIL"
  product        = "IINT"
  destination_id = newrelic_notification_destination.email[0].id

  property {
    key   = "subject"
    value = "[${var.environment}] {{issueTitle}}"
  }
}

resource "newrelic_workflow" "this" {
  count = local.notify ? 1 : 0

  name                  = var.name
  muting_rules_handling = "NOTIFY_ALL_ISSUES"

  issues_filter {
    name = "politica-${var.name}"
    type = "FILTER"

    predicate {
      attribute = "labels.policyIds"
      operator  = "EXACTLY_MATCHES"
      values    = [newrelic_alert_policy.this[0].id]
    }
  }

  destination {
    channel_id = newrelic_notification_channel.email[0].id
  }
}

# --- Condiciones de la API: datos de la aplicación, más precisos que los del balanceador.
locals {
  api_conditions = var.enabled ? {
    api-error-rate = {
      description = "Más del ${var.alert_config.error_rate_percent} % de las peticiones responden 5xx."
      query       = "SELECT percentage(count(*), WHERE ${local.is_error}) FROM Span WHERE ${local.base_where}"
      threshold   = var.alert_config.error_rate_percent
    }
    api-latency-p95 = {
      description = "Latencia p95 de la API sobre ${var.alert_config.latency_p95_ms} ms de forma sostenida."
      query       = "SELECT percentile(duration.ms, 95) FROM Span WHERE ${local.base_where}"
      threshold   = var.alert_config.latency_p95_ms
    }
  } : {}

  infra_conditions = var.enabled && var.aws_infra != null ? {
    api-cpu-high = {
      description = "CPU promedio del servicio sobre ${var.aws_infra.cpu_percent} %."
      query       = "SELECT average(aws.ecs.CPUUtilization) FROM Metric WHERE aws.ecs.ClusterName = '${var.aws_infra.ecs_cluster_name}' AND aws.ecs.ServiceName = '${var.aws_infra.ecs_service_name}'"
      operator    = "above"
      threshold   = var.aws_infra.cpu_percent
    }
    api-memory-high = {
      description = "Memoria promedio del servicio sobre ${var.aws_infra.memory_percent} %."
      query       = "SELECT average(aws.ecs.MemoryUtilization) FROM Metric WHERE aws.ecs.ClusterName = '${var.aws_infra.ecs_cluster_name}' AND aws.ecs.ServiceName = '${var.aws_infra.ecs_service_name}'"
      operator    = "above"
      threshold   = var.aws_infra.memory_percent
    }
    api-unhealthy-targets = {
      description = "Hay tareas que no pasan el health check del balanceador."
      query       = "SELECT max(aws.applicationelb.UnHealthyHostCount) FROM Metric WHERE aws.applicationelb.LoadBalancer = '${var.aws_infra.alb_arn_suffix}'"
      operator    = "above"
      threshold   = 0
    }
    db-cpu-high = {
      description = "CPU de la base de datos sobre ${var.aws_infra.db_cpu_percent} %."
      query       = "SELECT average(aws.rds.CPUUtilization) FROM Metric WHERE aws.rds.DBInstanceIdentifier = '${var.aws_infra.db_instance_identifier}'"
      operator    = "above"
      threshold   = var.aws_infra.db_cpu_percent
    }
    db-storage-low = {
      description = "Quedan menos de ${var.aws_infra.db_free_storage_gb} GB libres en la base de datos."
      query       = "SELECT min(aws.rds.FreeStorageSpace) / 1073741824 FROM Metric WHERE aws.rds.DBInstanceIdentifier = '${var.aws_infra.db_instance_identifier}'"
      operator    = "below"
      threshold   = var.aws_infra.db_free_storage_gb
    }
  } : {}
}

resource "newrelic_nrql_alert_condition" "api" {
  for_each = local.api_conditions

  policy_id                    = newrelic_alert_policy.this[0].id
  type                         = "static"
  name                         = "${var.name}-${each.key}"
  description                  = each.value.description
  runbook_url                  = "${var.runbook_base_url}#${each.key}"
  enabled                      = true
  violation_time_limit_seconds = 86400
  aggregation_window           = 60
  aggregation_method           = "event_flow"
  aggregation_delay            = 120
  fill_option                  = "none"

  nrql {
    query = each.value.query
  }

  critical {
    operator              = "above"
    threshold             = each.value.threshold
    threshold_duration    = var.alert_config.duration_minutes * 60
    threshold_occurrences = "all"
  }
}

# Métricas de CloudWatch por metric streams: llegan con unos minutos de demora.
resource "newrelic_nrql_alert_condition" "infra" {
  for_each = local.infra_conditions

  policy_id                    = newrelic_alert_policy.this[0].id
  type                         = "static"
  name                         = "${var.name}-${each.key}"
  description                  = each.value.description
  runbook_url                  = "${var.runbook_base_url}#${each.key}"
  enabled                      = true
  violation_time_limit_seconds = 86400
  aggregation_window           = 300
  aggregation_method           = "event_flow"
  aggregation_delay            = 300
  fill_option                  = "none"

  nrql {
    query = each.value.query
  }

  critical {
    operator              = each.value.operator
    threshold             = each.value.threshold
    threshold_duration    = var.aws_infra.duration_minutes * 60
    threshold_occurrences = "all"
  }
}
