locals {
  common_tags = merge(var.tags, {
    ManagedBy = "Terraform"
    Service   = var.name
  })

  create_topic = var.enabled && var.notification_topic_arn == null
  wanted       = { for alarm in coalesce(var.alarm_names, ["api-cpu-high", "api-memory-high", "api-unhealthy-targets", "api-latency-p95", "api-error-rate", "db-cpu-high", "db-storage-low"]) : alarm => true } # gitleaks:allow (nombres de alarmas, no claves)
  topic_arn    = local.create_topic ? aws_sns_topic.this[0].arn : var.notification_topic_arn
  config       = var.alarm_config

  ecs_dimensions = {
    ClusterName = var.ecs.cluster_name
    ServiceName = var.ecs.service_name
  }

  # Alarmas de una sola métrica. Cada una: señal, umbral, severidad y runbook.
  simple_alarms = merge(
    {
      api-cpu-high = {
        severity    = "warning"
        description = "CPU promedio del servicio sobre ${local.config.cpu_percent} %. Si sigue, el autoescalado no alcanza."
        namespace   = "AWS/ECS"
        metric      = "CPUUtilization"
        statistic   = "Average"
        dimensions  = local.ecs_dimensions
        operator    = "GreaterThanThreshold"
        threshold   = local.config.cpu_percent
        missing     = "missing"
      }
      api-memory-high = {
        severity    = "warning"
        description = "Memoria promedio del servicio sobre ${local.config.memory_percent} %: riesgo de tareas terminadas por falta de memoria."
        namespace   = "AWS/ECS"
        metric      = "MemoryUtilization"
        statistic   = "Average"
        dimensions  = local.ecs_dimensions
        operator    = "GreaterThanThreshold"
        threshold   = local.config.memory_percent
        missing     = "missing"
      }
      api-unhealthy-targets = {
        severity    = "critical"
        description = "Hay tareas que no pasan el health check del balanceador (/health/live)."
        namespace   = "AWS/ApplicationELB"
        metric      = "UnHealthyHostCount"
        statistic   = "Maximum"
        dimensions  = { LoadBalancer = var.alb.arn_suffix, TargetGroup = var.alb.target_group_arn_suffix }
        operator    = "GreaterThanThreshold"
        threshold   = 0
        missing     = "notBreaching"
      }
    },
    var.db_instance_identifier == null ? {} : {
      db-cpu-high = {
        severity    = "warning"
        description = "CPU de la base de datos sobre ${local.config.db_cpu_percent} %."
        namespace   = "AWS/RDS"
        metric      = "CPUUtilization"
        statistic   = "Average"
        dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
        operator    = "GreaterThanThreshold"
        threshold   = local.config.db_cpu_percent
        missing     = "missing"
      }
      db-storage-low = {
        severity    = "critical"
        description = "Quedan menos de ${local.config.db_free_storage_gb} GB libres en la base de datos."
        namespace   = "AWS/RDS"
        metric      = "FreeStorageSpace"
        statistic   = "Minimum"
        dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
        operator    = "LessThanThreshold"
        threshold   = local.config.db_free_storage_gb * 1024 * 1024 * 1024
        missing     = "missing"
      }
    },
  )
}

resource "aws_sns_topic" "this" {
  count = local.create_topic ? 1 : 0

  name              = "${var.name}-alarms"
  kms_master_key_id = "alias/aws/sns"
  tags              = local.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  for_each = local.create_topic ? toset(var.notification_emails) : toset([])

  topic_arn = aws_sns_topic.this[0].arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "simple" {
  for_each = var.enabled ? { for key, alarm in local.simple_alarms : key => alarm if lookup(local.wanted, key, false) } : {}

  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = "[${each.value.severity}] ${each.value.description} Runbook: ${var.runbook_base_url}#${each.key}"
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  dimensions          = each.value.dimensions
  comparison_operator = each.value.operator
  threshold           = each.value.threshold
  period              = local.config.period_seconds
  evaluation_periods  = local.config.evaluation_periods
  datapoints_to_alarm = local.config.datapoints_to_alarm
  treat_missing_data  = each.value.missing
  alarm_actions       = [local.topic_arn]
  ok_actions          = [local.topic_arn]

  tags = merge(local.common_tags, { Severity = each.value.severity })
}

resource "aws_cloudwatch_metric_alarm" "latency_p95" {
  count = var.enabled && lookup(local.wanted, "api-latency-p95", false) ? 1 : 0

  alarm_name          = "${var.name}-api-latency-p95"
  alarm_description   = "[warning] Latencia p95 de la API sobre ${local.config.latency_p95_ms} ms de forma sostenida. Runbook: ${var.runbook_base_url}#api-latency-p95"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  dimensions          = { LoadBalancer = var.alb.arn_suffix, TargetGroup = var.alb.target_group_arn_suffix }
  comparison_operator = "GreaterThanThreshold"
  threshold           = local.config.latency_p95_ms / 1000
  period              = local.config.period_seconds
  evaluation_periods  = local.config.evaluation_periods
  datapoints_to_alarm = local.config.datapoints_to_alarm
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.topic_arn]
  ok_actions          = [local.topic_arn]

  tags = merge(local.common_tags, { Severity = "warning" })
}

# Tasa de errores 5xx de la API. Con poco tráfico no evalúa: un error en tres peticiones no es una caída.
resource "aws_cloudwatch_metric_alarm" "error_rate" {
  count = var.enabled && lookup(local.wanted, "api-error-rate", false) ? 1 : 0

  alarm_name          = "${var.name}-api-error-rate"
  alarm_description   = "[critical] Más del ${local.config.error_rate_percent} % de las peticiones responden 5xx. Runbook: ${var.runbook_base_url}#api-error-rate"
  comparison_operator = "GreaterThanThreshold"
  threshold           = local.config.error_rate_percent
  evaluation_periods  = local.config.evaluation_periods
  datapoints_to_alarm = local.config.datapoints_to_alarm
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.topic_arn]
  ok_actions          = [local.topic_arn]

  metric_query {
    id          = "rate"
    label       = "Porcentaje de 5xx"
    return_data = true
    expression  = "IF(requests >= ${local.config.min_requests_for_rate}, 100 * FILL(errors, 0) / requests, 0)"
  }

  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      stat        = "Sum"
      period      = local.config.period_seconds
      dimensions  = { LoadBalancer = var.alb.arn_suffix, TargetGroup = var.alb.target_group_arn_suffix }
    }
  }

  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      stat        = "Sum"
      period      = local.config.period_seconds
      dimensions  = { LoadBalancer = var.alb.arn_suffix, TargetGroup = var.alb.target_group_arn_suffix }
    }
  }

  tags = merge(local.common_tags, { Severity = "critical" })
}
