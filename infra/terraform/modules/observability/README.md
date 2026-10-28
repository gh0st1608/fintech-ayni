# Módulo `observability`

Alarmas de CloudWatch configurables por datos (`alarm_config`): CPU y memoria del servicio, targets no sanos, latencia p95, tasa de 5xx y, con base de datos, CPU y almacenamiento libre. Cada alarma tiene severidad y enlace al runbook. Con New Relic como lugar principal, se usa de **respaldo** eligiendo unas pocas con `alarm_names`. Se activa o desactiva con `enabled`.

## Ejemplo

```hcl
module "observability" {
  source = "../../../../modules/observability"

  name                   = "ayni-prd-api"
  ecs                    = { cluster_name = module.api.cluster_name, service_name = module.api.service_name }
  alb                    = { arn_suffix = module.api.alb_arn_suffix, target_group_arn_suffix = module.api.target_group_arn_suffix }
  db_instance_identifier = module.database.instance_identifier
  alarm_names            = ["api-unhealthy-targets", "db-storage-low"]
  notification_emails    = ["guardia@example.com"]
  runbook_base_url       = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/api.md"
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre lógico del servicio. |
| `enabled` | no | Activa la creación de alarmas y del tópico de notificaciones. |
| `alarm_config` | no | Umbrales y evaluación de las señales principales. Valores iniciales: se ajustan con la línea base real. |
| `alarm_names` | no | Alarmas a crear. null: todas. Con New Relic como lugar principal, CloudWatch queda de respaldo con unas pocas (p. ej. ["api-unhealthy-targets", "db-storage-low"]). |
| `ecs` | **sí** | Servicio ECS que se vigila. |
| `alb` | **sí** | Balanceador y target group (sufijos de ARN, dimensiones de CloudWatch). |
| `db_instance_identifier` | no | Instancia RDS. null: sin alarmas de base de datos. |
| `notification_topic_arn` | no | Tópico SNS existente. null: el módulo crea uno. No almacenar credenciales aquí. |
| `notification_emails` | no | Correos suscritos al tópico creado por el módulo (cada uno confirma la suscripción). |
| `runbook_base_url` | **sí** | URL del runbook; cada alarma enlaza a su sección (#nombre-de-la-alarma). |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `notification_topic_arn` | Tópico que recibe las alarmas (null si el módulo está desactivado). |
| `alarm_arns` | ARN de cada alarma, por nombre. |

## Pruebas

`terraform test` con provider simulado: [observability.tftest.hcl](tests/observability.tftest.hcl).
