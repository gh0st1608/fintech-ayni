# Módulo `database`

RDS for PostgreSQL privada: cifrada, TLS obligatorio, contraseña gestionada por RDS en Secrets Manager, autenticación IAM, backups y protección contra borrado. El acceso se concede por security group.

## Ejemplo

```hcl
module "database" {
  source = "../../../../modules/database"

  name                    = "ayni-prd"
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.private_subnet_ids
  allowed_security_groups = { api = module.api.security_group_id }
  multi_az                = true
  backup_retention_days   = 30
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Identificador de la instancia (p. ej. ayni-prd). |
| `vpc_id` | **sí** | VPC donde vive la base de datos. |
| `subnet_ids` | **sí** | Subredes privadas, en al menos dos zonas. |
| `allowed_security_groups` | no | Security groups que pueden conectarse, por un nombre fijo (p. ej. { api = sg-… }). Las claves tienen que conocerse antes del apply. |
| `engine_version` | no | Versión mayor de PostgreSQL. Las versiones menores se actualizan solas en la ventana de mantenimiento. |
| `instance_class` | no | Clase de instancia. |
| `allocated_storage` | no | Almacenamiento inicial en GB (gp3). |
| `max_allocated_storage` | no | Tope del autoescalado de almacenamiento en GB. Igual a allocated_storage lo desactiva. |
| `database_name` | no | Base de datos inicial. |
| `master_username` | no | Usuario administrador. La API usa uno propio con permisos mínimos, creado por las migraciones. |
| `multi_az` | no | Réplica en espera en otra zona. |
| `backup_retention_days` | no | Días de backups automáticos. |
| `deletion_protection` | no | Impide borrar la instancia hasta desactivarlo. |
| `skip_final_snapshot` | no | Borrar sin snapshot final. Solo en ambientes descartables. |
| `performance_insights_enabled` | no | Performance Insights (7 días gratis). |
| `monitoring_interval` | no | Segundos entre métricas de Enhanced Monitoring. 0 lo desactiva. |
| `log_retention_days` | no | Retención de los logs de PostgreSQL en CloudWatch. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `address` | Host de la instancia. |
| `port` | Puerto de PostgreSQL. |
| `database_name` | Base de datos inicial. |
| `instance_identifier` | Identificador, para las alarmas. |
| `security_group_id` | Security group de la base de datos. |
| `master_user_secret_arn` | Secreto con la credencial del administrador (gestionado por RDS). Solo para migraciones. |
| `settings` | Configuración de resiliencia efectiva, para pruebas y auditoría del plan. |
| `log_group_names` | Grupos de logs de PostgreSQL, por tipo. |

## Pruebas

`terraform test` con provider simulado: [database.tftest.hcl](tests/database.tftest.hcl).
