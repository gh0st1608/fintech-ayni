# Módulo `network`

VPC en 2 a 4 zonas: subredes públicas y privadas /20, NAT opcional (`none`, `single`, `per_az`), endpoint gateway de S3, security group por defecto cerrado y VPC Flow Logs de rechazos.

## Ejemplo

```hcl
module "network" {
  source = "../../../../modules/network"

  name                     = "ayni-prd"
  cidr_block               = "10.40.0.0/16"
  availability_zones       = ["us-east-1a", "us-east-1b"]
  nat_gateway_mode         = "single"
  flow_logs_retention_days = 30
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Prefijo de los recursos (p. ej. ayni-prd). |
| `cidr_block` | **sí** | Rango IPv4 de la VPC. Se divide en subredes /20 (públicas y privadas por zona). |
| `availability_zones` | **sí** | Zonas de disponibilidad. Cada una recibe una subred pública y una privada. |
| `nat_gateway_mode` | no | none: sin salida desde las subredes privadas. single: un NAT compartido. per_az: uno por zona. |
| `flow_logs_retention_days` | no | Días de retención de los VPC Flow Logs (rechazos). null los desactiva. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `vpc_id` | ID de la VPC. |
| `vpc_cidr_block` | Rango IPv4 de la VPC. |
| `public_subnet_ids` | Subredes públicas, en el orden de availability_zones. |
| `private_subnet_ids` | Subredes privadas, en el orden de availability_zones. |
| `has_private_egress` | true si las subredes privadas salen a internet por NAT. |
| `flow_logs_log_group_name` | Grupo de logs de los flow logs (null si están desactivados). |

## Pruebas

`terraform test` con provider simulado: [network.tftest.hcl](tests/network.tftest.hcl).
