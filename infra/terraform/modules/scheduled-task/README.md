# Módulo `scheduled-task`

Tarea programada: EventBridge Scheduler lanza una tarea ECS Fargate con la misma imagen de la API y otro comando (ADR, Tareas programadas). Reutiliza el cluster, los roles, el grupo de logs y el security group del servicio.

Cualquier falla termina en una cola SQS, con una alarma:

- **El scheduler no pudo lanzar la tarea:** después de los reintentos, va a la dead letter queue.
- **La tarea terminó con error o no arrancó:** una regla de EventBridge lo envía a la misma cola, porque el scheduler no ve el código de salida.

Los mensajes se guardan 14 días. Una vez revisados, hay que vaciar la cola para que la alarma vuelva a OK.

El job tiene que ser idempotente: el scheduler reintenta.

## Ejemplo

```hcl
module "circle_cycle" {
  source = "../../../../modules/scheduled-task"

  name                = "ayni-prd-circle-cycle"
  enabled             = false
  schedule_expression = "cron(0 6 * * ? *)"
  schedule_timezone   = "America/Lima"

  cluster_arn        = module.api.cluster_arn
  image              = "${module.ecr.repository_url}:${var.image_tag}"
  command            = ["node", "dist/jobs/circle-cycle.js"]
  environment        = local.api_environment
  secrets            = local.api_secrets
  execution_role_arn = module.api.execution_role_arn
  task_role_arn      = module.api.task_role_arn
  log_group_name     = module.api.log_group_name
  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [module.api.security_group_id]
  alarm_enabled      = true
  alarm_topic_arn    = module.observability.notification_topic_arn
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre del job. Prefijo de todos sus recursos. |
| `enabled` | no | Estado del schedule. false lo crea deshabilitado. |
| `schedule_expression` | **sí** | `cron(...)` o `rate(...)` de EventBridge Scheduler. |
| `schedule_timezone` | no | Zona horaria de la expresión (IANA). |
| `maximum_retry_attempts` | no | Reintentos si no puede lanzar la tarea. |
| `cluster_arn` | **sí** | Cluster ECS. |
| `image` | **sí** | Imagen con etiqueta inmutable. |
| `command` | **sí** | Comando del job. |
| `cpu`, `memory` | no | Tamaño de la tarea. |
| `environment` | no | Variables no secretas. |
| `secrets` | no | Variables secretas: nombre -> ARN. El rol de ejecución ya tiene que poder leerlas. |
| `execution_role_arn` | **sí** | Rol de ejecución de ECS. |
| `task_role_arn` | **sí** | Rol de la aplicación. |
| `log_group_name` | **sí** | Grupo de logs. |
| `subnet_ids` | **sí** | Subredes de la tarea. |
| `security_group_ids` | **sí** | Security groups de la tarea. |
| `assign_public_ip` | no | IP pública, necesaria en subredes públicas sin NAT. |
| `alarm_enabled` | no | Crea la alarma de fallas. Requiere `alarm_topic_arn`. |
| `alarm_topic_arn` | no | Tópico SNS de la alarma. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `schedule_name` | Schedule de EventBridge. |
| `schedule_state` | ENABLED o DISABLED. |
| `task_definition_arn` | Task definition, para lanzar el job a mano. |
| `failures_queue_url` | Cola con los fallos del job. |
