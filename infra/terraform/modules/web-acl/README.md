# Módulo `web-acl`

Web ACL regional de WAF: rate limit por IP más los grupos administrados de AWS (reglas comunes, entradas maliciosas conocidas, reputación de IP). Registra solo las peticiones bloqueadas y oculta la cabecera `authorization`.

## Ejemplo

```hcl
module "web_acl" {
  source = "../../../../modules/web-acl"

  name                     = "ayni-prd-api"
  rate_limit_per_5_minutes = 1000
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre de la web ACL. |
| `rate_limit_per_5_minutes` | no | Peticiones por IP en 5 minutos antes de bloquear. Primera capa del rate limit; la API tiene la suya por tarea (ADR). |
| `log_retention_days` | no | Retención de los logs de peticiones bloqueadas. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `web_acl_arn` | ARN de la web ACL, para asociarla al balanceador. |
| `log_group_name` | Grupo de logs de las peticiones bloqueadas (para reenviarlo a New Relic). |

## Pruebas

Sin pruebas propias: lo cubren `validate`, tflint, checkov y la prueba del stack de prd.
