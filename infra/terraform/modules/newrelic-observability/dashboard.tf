locals {
  from_api = "FROM Span WHERE ${local.base_where}"
}

# Páginas separadas por dominio (base técnica): API e infraestructura. Mobile y negocio se agregan
# cuando la app y los flujos de pago estén instrumentados.
resource "newrelic_one_dashboard" "this" {
  count = var.enabled ? 1 : 0

  name        = var.name
  permissions = "public_read_only"

  page {
    name = "API"

    widget_billboard {
      title  = "Peticiones por minuto"
      row    = 1
      column = 1
      width  = 3
      height = 3

      nrql_query {
        query = "SELECT rate(count(*), 1 minute) ${local.from_api} SINCE 30 minutes ago"
      }
    }

    widget_billboard {
      title  = "Tasa de errores 5xx (%)"
      row    = 1
      column = 4
      width  = 3
      height = 3

      nrql_query {
        query = "SELECT percentage(count(*), WHERE ${local.is_error}) ${local.from_api} SINCE 30 minutes ago"
      }

      critical = var.alert_config.error_rate_percent
    }

    widget_billboard {
      title  = "Latencia p95 (ms)"
      row    = 1
      column = 7
      width  = 3
      height = 3

      nrql_query {
        query = "SELECT percentile(duration.ms, 95) ${local.from_api} SINCE 30 minutes ago"
      }

      critical = var.alert_config.latency_p95_ms
    }

    widget_billboard {
      title  = "Versión desplegada"
      row    = 1
      column = 10
      width  = 3
      height = 3

      nrql_query {
        query = "SELECT latest(service.version) ${local.from_api} SINCE 1 hour ago"
      }
    }

    widget_line {
      title  = "Latencia p50 / p95 / p99 (ms)"
      row    = 4
      column = 1
      width  = 6
      height = 3

      nrql_query {
        query = "SELECT percentile(duration.ms, 50, 95, 99) ${local.from_api} TIMESERIES"
      }
    }

    widget_line {
      title  = "Respuestas por código"
      row    = 4
      column = 7
      width  = 6
      height = 3

      nrql_query {
        query = "SELECT count(*) ${local.from_api} FACET http.response.status_code TIMESERIES"
      }
    }

    widget_table {
      title  = "Rutas más lentas y con más errores"
      row    = 7
      column = 1
      width  = 12
      height = 4

      nrql_query {
        query = "SELECT count(*) AS 'peticiones', percentage(count(*), WHERE ${local.is_error}) AS '% 5xx', percentile(duration.ms, 95) AS 'p95 ms' ${local.from_api} FACET http.request.method, http.route LIMIT 20"
      }
    }
  }

  dynamic "page" {
    for_each = var.aws_infra == null ? [] : [var.aws_infra]

    content {
      name = "Infraestructura"

      widget_line {
        title  = "ECS: CPU y memoria (%)"
        row    = 1
        column = 1
        width  = 6
        height = 3

        nrql_query {
          query = "SELECT average(aws.ecs.CPUUtilization) AS 'CPU', average(aws.ecs.MemoryUtilization) AS 'Memoria' FROM Metric WHERE aws.ecs.ClusterName = '${page.value.ecs_cluster_name}' AND aws.ecs.ServiceName = '${page.value.ecs_service_name}' TIMESERIES"
        }
      }

      widget_line {
        title  = "ALB: peticiones, 5xx y targets no sanos"
        row    = 1
        column = 7
        width  = 6
        height = 3

        nrql_query {
          query = "SELECT sum(aws.applicationelb.RequestCount) AS 'Peticiones', sum(aws.applicationelb.HTTPCode_Target_5XX_Count) AS '5xx', max(aws.applicationelb.UnHealthyHostCount) AS 'No sanos' FROM Metric WHERE aws.applicationelb.LoadBalancer = '${page.value.alb_arn_suffix}' TIMESERIES"
        }
      }

      widget_line {
        title  = "RDS: CPU (%) y conexiones"
        row    = 4
        column = 1
        width  = 6
        height = 3

        nrql_query {
          query = "SELECT average(aws.rds.CPUUtilization) AS 'CPU', average(aws.rds.DatabaseConnections) AS 'Conexiones' FROM Metric WHERE aws.rds.DBInstanceIdentifier = '${page.value.db_instance_identifier}' TIMESERIES"
        }
      }

      widget_line {
        title  = "RDS: almacenamiento libre (GB)"
        row    = 4
        column = 7
        width  = 6
        height = 3

        nrql_query {
          query = "SELECT min(aws.rds.FreeStorageSpace) / 1073741824 AS 'GB libres' FROM Metric WHERE aws.rds.DBInstanceIdentifier = '${page.value.db_instance_identifier}' TIMESERIES"
        }
      }
    }
  }
}
