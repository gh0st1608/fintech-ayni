# Módulo `audit-trail`

Auditoría de la cuenta con CloudTrail: trail multi-región con validación de integridad, bucket cifrado con KMS y retención, eventos en CloudWatch Logs y **data events** de los buckets indicados (quién lee o sube cada documento KYC). Agrega siete alarmas de seguridad (recomendaciones CIS) que excluyen a los roles de confianza, como el de apply de Terraform.

## Ejemplo

```hcl
module "audit_trail" {
  source = "../../../../modules/audit-trail"

  name                    = "ayni-prd"
  data_event_bucket_names = ["ayni-prd-documents-123456789012"]
  trusted_role_names      = ["ayni-prd-terraform-apply"]
  notification_emails     = ["seguridad@example.com"]
  runbook_base_url        = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/security.md"
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Prefijo de los recursos (p. ej. ayni-prd). |
| `s3_retention_days` | no | Días que se conservan los eventos en S3 (copia íntegra y validable). |
| `cloudwatch_retention_days` | no | Días de eventos en CloudWatch Logs, donde corren los filtros de seguridad. |
| `data_event_bucket_names` | no | Buckets cuyos accesos a objetos (lectura y escritura) se auditan: los documentos KYC. |
| `security_alarms_enabled` | no | Crea los filtros y alarmas de seguridad (recomendaciones CIS). |
| `trusted_role_names` | no | Roles cuyos cambios de IAM y de security groups no alarman (p. ej. el rol de apply de Terraform: sus cambios pasan por un plan aprobado). |
| `notification_topic_arn` | no | Tópico SNS para las alarmas de seguridad. null: el módulo crea uno. |
| `notification_emails` | no | Correos suscritos al tópico creado por el módulo. |
| `runbook_base_url` | **sí** | URL del runbook de seguridad; cada alarma enlaza a su sección. |
| `force_destroy` | no | Permite destruir el bucket con eventos. Solo en ambientes descartables. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `trail_arn` | ARN del trail. |
| `bucket_name` | Bucket con la copia íntegra de los eventos. |
| `log_group_name` | Grupo de CloudWatch Logs con los eventos (para reenviarlos a New Relic). |
| `security_topic_arn` | Tópico de las alarmas de seguridad (null si están desactivadas). |

## Pruebas

`terraform test` con provider simulado: [audit-trail.tftest.hcl](tests/audit-trail.tftest.hcl).
