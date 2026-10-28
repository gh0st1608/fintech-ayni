# Módulo `newrelic-aws-integration`

Integración de la cuenta AWS con New Relic (una por cuenta): rol de solo lectura con external ID, vínculo por metric streams (PUSH), Firehose de métricas y de logs hacia los endpoints US o EU, y bucket para los envíos rechazados. La license key se lee de Secrets Manager (`{"api_key": "…"}`): nunca pasa por el estado de Terraform.

## Ejemplo

```hcl
module "newrelic_aws" {
  source = "../../../../modules/newrelic-aws-integration"

  name                   = "ayni-prd"
  newrelic_account_id    = 1234567
  newrelic_region        = "US"
  license_key_secret_arn = aws_secretsmanager_secret.newrelic_license_key.arn
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Prefijo de los recursos (p. ej. ayni-prd). Los roles se llaman <name>-newrelic-*. |
| `newrelic_account_id` | **sí** | ID de la cuenta de New Relic que recibe los datos. |
| `newrelic_region` | no | Región de la cuenta de New Relic. |
| `license_key_secret_arn` | **sí** | Secreto con la license key de ingesta en formato {"api_key": "…"}. Firehose la lee de ahí: nunca pasa por el estado. |
| `metric_namespaces` | no | Namespaces de CloudWatch que se envían a New Relic. |
| `logs_enabled` | no | Crea el Firehose de logs (los grupos se suscriben con el módulo log-forwarding). |
| `failed_delivery_retention_days` | no | Días que se conservan en S3 los envíos que New Relic rechazó. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `linked_account_id` | ID del vínculo de la cuenta AWS en New Relic. |
| `logs_firehose_arn` | Firehose de logs: destino de log-forwarding (null si logs_enabled = false). |
| `logs_subscription_role_arn` | Rol de suscripción de CloudWatch Logs (null si logs_enabled = false). |

## Pruebas

`terraform test` con provider simulado: [newrelic-aws-integration.tftest.hcl](tests/newrelic-aws-integration.tftest.hcl).
