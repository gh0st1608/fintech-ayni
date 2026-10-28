# Módulo `newrelic-observability`

Observabilidad de la API en New Relic, el lugar principal de alertas: política con workflow de correo, condiciones NRQL sobre los spans de OpenTelemetry (errores 5xx, latencia p95) y sobre las métricas de AWS (ECS, ALB, RDS), SLO de disponibilidad y latencia con alerta de consumo rápido del presupuesto de error, monitor sintético externo del health check y dashboard con páginas de API e infraestructura. Cada pieza opcional se activa por variable.

## Ejemplo

```hcl
module "newrelic" {
  source = "../../../../modules/newrelic-observability"

  name                = "ayni-prd-api"
  account_id          = 1234567
  service_name        = "ayni-api"
  environment         = "prod"
  notification_emails = ["guardia@example.com"]
  slo                 = { enabled = true }
  synthetics          = { url = "https://backend-ayni.solutionserj.com/health/live" }
  aws_infra = {
    ecs_cluster_name       = module.api.cluster_name
    ecs_service_name       = module.api.service_name
    alb_arn_suffix         = module.api.alb_arn_suffix
    db_instance_identifier = module.database.instance_identifier
  }
  runbook_base_url = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/api.md"
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre lógico (p. ej. ayni-prd-api): prefijo de la política, el dashboard y el monitor. |
| `enabled` | no | Crea los recursos en New Relic. |
| `account_id` | **sí** | Cuenta de New Relic. |
| `service_name` | **sí** | service.name que reporta la API por OpenTelemetry (APP_NAME). |
| `environment` | **sí** | deployment.environment.name que reporta la API (DEPLOYMENT_ENVIRONMENT). |
| `notification_emails` | no | Correos que reciben los issues de la política. Vacío: sin destino (solo se ven en New Relic). |
| `alert_config` | no | Umbrales de las condiciones de la API. Iniciales: se ajustan con la línea base real. |
| `slo` | no | SLO de disponibilidad y latencia. Activar cuando la API ya reportó a la cuenta: el SLO se asocia a la entidad del servicio. |
| `synthetics` | no | Monitor externo del health check. null: sin monitor (p. ej. dev, que no es accesible desde internet). |
| `aws_infra` | no | Recursos AWS cuyas métricas llegan por metric streams. null: sin condiciones ni página de infraestructura. |
| `runbook_base_url` | **sí** | URL del runbook; cada condición enlaza a su sección. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `policy_id` | Política de alertas (null si el módulo está desactivado). |
| `dashboard_url` | Enlace al dashboard. |
| `condition_names` | Condiciones de alerta creadas. |

## Pruebas

`terraform test` con provider simulado: [newrelic-observability.tftest.hcl](tests/newrelic-observability.tftest.hcl).
