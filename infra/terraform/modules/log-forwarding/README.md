# Módulo `log-forwarding`

Suscribe grupos de CloudWatch Logs a un destino (el Firehose de logs de New Relic). Las claves del mapa son fijas para que el plan conozca las suscripciones.

## Ejemplo

```hcl
module "logs_to_newrelic" {
  source = "../../../../modules/log-forwarding"

  name            = "ayni-prd-newrelic"
  log_groups      = { waf = module.web_acl.log_group_name }
  destination_arn = data.aws_kinesis_firehose_delivery_stream.newrelic_logs.arn
  role_arn        = data.aws_iam_role.newrelic_logs_subscription.arn
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Prefijo de los filtros de suscripción. |
| `log_groups` | **sí** | Grupos de logs a reenviar, por un nombre fijo (p. ej. { waf = "aws-waf-logs-…" }). Las claves tienen que conocerse antes del apply. |
| `destination_arn` | **sí** | Firehose de destino (el de logs de newrelic-aws-integration). |
| `role_arn` | **sí** | Rol que CloudWatch Logs asume para escribir en el Firehose. |
| `filter_pattern` | no | Patrón de filtro. Vacío: todos los eventos. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `subscription_names` | Filtros de suscripción creados, por clave. |

## Pruebas

Sin pruebas propias: lo cubren `validate`, tflint, checkov y la prueba del stack de prd.
