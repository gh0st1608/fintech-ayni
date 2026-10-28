# Módulo `api-domain`

Certificado ACM con validación DNS para el dominio de la API. Con `route53` crea la validación y el alias al ALB (en prd, la zona delegada desde GoDaddy); sin él, expone los registros para crearlos en un DNS externo.

## Ejemplo

```hcl
module "api_domain" {
  source = "../../../../modules/api-domain"

  domain_name  = "backend-ayni.solutionserj.com"
  route53      = { zone_id = aws_route53_zone.api.zone_id }
  alb_dns_name = module.api.alb_dns_name
  alb_zone_id  = module.api.alb_zone_id
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `domain_name` | **sí** | Dominio público de la API (p. ej. backend-ayni.solutionserj.com). |
| `route53` | no | Hosted zone de Route 53 del dominio. null: el DNS es externo y los registros se crean a mano. |
| `alb_dns_name` | no | DNS del balanceador. Solo se usa con route53. |
| `alb_zone_id` | no | Hosted zone del balanceador. Solo se usa con route53. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `certificate_arn` | Certificado validado, para el listener HTTPS. |
| `validation_records` | Registros CNAME que validan el certificado. Con DNS externo, se crean en el proveedor del dominio. |

## Pruebas

`terraform test` con provider simulado: [api-domain.tftest.hcl](tests/api-domain.tftest.hcl).
