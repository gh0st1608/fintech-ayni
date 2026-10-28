# Módulo `service-runtime`

Servicio en ECS Fargate detrás de un ALB: task definition con sistema de archivos de solo lectura, secretos inyectados, circuit breaker con rollback, HTTPS opcional con redirección, WAF opcional, logs en CloudWatch y autoescalado por CPU.

## Ejemplo

```hcl
module "api" {
  source = "../../../../modules/service-runtime"

  name               = "ayni-prd-api"
  vpc_id             = module.network.vpc_id
  alb_subnet_ids     = module.network.public_subnet_ids
  service_subnet_ids = module.network.private_subnet_ids
  image              = "${module.ecr.repository_url}:${var.image_tag}"

  environment   = { NODE_ENV = "production" }
  secrets       = { NEW_RELIC_LICENSE_KEY = aws_secretsmanager_secret.nr.arn }
  task_policies = { documents = module.documents.read_write_policy_json }

  https = { certificate_arn = module.api_domain.certificate_arn }
  waf   = { web_acl_arn = module.web_acl.web_acl_arn }
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre del servicio (p. ej. ayni-prd-api). Prefijo de todos sus recursos. |
| `vpc_id` | **sí** | VPC del servicio. |
| `alb_subnet_ids` | **sí** | Subredes públicas del balanceador. |
| `service_subnet_ids` | **sí** | Subredes de las tareas: privadas si hay NAT, públicas si no. |
| `assign_public_ip` | no | IP pública en las tareas. Necesario en subredes públicas sin NAT para llegar a ECR, Secrets Manager y New Relic. |
| `image` | **sí** | Imagen completa del contenedor, con etiqueta inmutable (repositorio:sha). |
| `container_port` | no | Puerto de la API dentro del contenedor (PORT). |
| `cpu` | no | Unidades de CPU de la tarea (256 = 0,25 vCPU). |
| `memory` | no | Memoria de la tarea en MiB. |
| `desired_count` | no | Tareas al crear el servicio. Con autoescalado, lo ajusta el autoescalado. |
| `autoscaling` | no | Autoescalado por CPU. null lo desactiva. |
| `environment` | no | Variables de entorno no secretas. |
| `secrets` | no | Variables de entorno secretas: nombre -> ARN de Secrets Manager (admite el sufijo :clave::) o de un parámetro SSM. |
| `task_policies` | no | Permisos de la aplicación: nombre fijo -> política JSON (p. ej. { documents = … }). |
| `health_check_path` | no | Ruta que comprueba el ALB. /health/live: una caída de la base de datos no reemplaza las tareas (ADR). |
| `https` | no | HTTPS en 443 con redirección desde 80. null: solo HTTP (dev local). |
| `ingress_cidr_blocks` | no | Orígenes que pueden llegar al balanceador. |
| `waf` | no | Web ACL de WAF asociada al balanceador. null: sin WAF. |
| `deregistration_delay` | no | Segundos que el ALB espera para quitar una tarea. Deja terminar las peticiones en curso (ADR). |
| `stop_timeout` | no | Segundos entre SIGTERM y SIGKILL: margen para cerrar y vaciar la telemetría (máximo 5 s en la API). |
| `log_retention_days` | no | Retención de los logs del contenedor. |
| `alb_deletion_protection` | no | Impide borrar el balanceador. |
| `container_insights` | no | Métricas de Container Insights (tienen costo). |
| `wait_for_steady_state` | no | terraform apply espera a que el despliegue termine (o falle y vuelva atrás). |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `cluster_name` | Cluster ECS. |
| `service_name` | Servicio ECS. |
| `security_group_id` | Security group de las tareas: se autoriza en la base de datos. |
| `alb_dns_name` | DNS del balanceador (destino del registro del dominio). |
| `alb_zone_id` | Hosted zone del balanceador, para un registro alias. |
| `alb_arn_suffix` | Dimensión LoadBalancer de las métricas del ALB. |
| `target_group_arn_suffix` | Dimensión TargetGroup de las métricas del ALB. |
| `log_group_name` | Logs del contenedor. |
| `task_role_arn` | Rol de la aplicación. |
| `execution_role_arn` | Rol de ejecución de ECS. |
| `settings` | Configuración de exposición efectiva, para pruebas y auditoría del plan. |

## Pruebas

`terraform test` con provider simulado: [service-runtime.tftest.hcl](tests/service-runtime.tftest.hcl).
