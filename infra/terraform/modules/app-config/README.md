# Módulo `app-config`

Valores de producto de la API —moneda, montos y duraciones— en un solo sitio. No crea recursos: solo
expone un mapa que los ambientes mezclan con su propia configuración.

## Por qué existe

Estos valores estaban repetidos en el `terraform.tfvars` de cada ambiente y en
`apps/backend/.env.example`. Repetidos acaban divergiendo, y divergieron: `JOIN_PAYOUT_MAX` decía
`600000` en el ejemplo y `12000000` en los dos tfvars. Ese segundo valor hace que la API **no
arranque** en production, porque por encima de 6.000 PEN la validación exige `KYC_PROVIDER=verificaid`.

## Uso

```hcl
module "app_config" {
  source = "../../../../modules/app-config"
}

locals {
  # El tfvars del ambiente va después: lo que declare, manda.
  api_environment = merge(module.app_config.defaults, var.app_config, ...)
}
```

## Qué va aquí y qué no

| Va aquí                                        | Va en el tfvars del ambiente                       |
| ---------------------------------------------- | -------------------------------------------------- |
| Decisiones de producto iguales en todas partes | Nivel de log, orígenes CORS, límites de tasa       |
| Moneda, montos, duraciones                     | Proveedores (`PUSH_PROVIDER`, `PAYMENT_GATEWAY`)   |
|                                                | Nombre y versión de la aplicación                  |
