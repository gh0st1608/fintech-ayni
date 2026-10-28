# Infraestructura como código (COPAYNI-12)

Implementa el [ADR de infraestructura](../../docs/architecture.md) siguiendo la base técnica "Terraform IaC Enterprise":

- módulos pequeños con una sola responsabilidad;
- stacks por ambiente que solo componen;
- estado protegido;
- calidad automatizada;
- observabilidad configurable.

| Ambiente | Dónde corre | Para qué |
| --- | --- | --- |
| **dev** | [floci](https://github.com/floci-io/floci) 2.2.0 en Docker, en tu máquina; New Relic opcional con tu cuenta de dev | Pruebas locales de la infraestructura y de la API en contenedor. Sin costo y sin cuenta AWS. |
| **prd** | Cuenta AWS dedicada, `us-east-1`, y la cuenta de New Relic de prd | Producción. Solo se aplica desde CI. |

## Estructura

```text
infra/
├── local/compose.yaml               floci (emulador AWS de dev)
└── terraform/
    ├── modules/                      mecanismos reutilizables, sin valores de ambiente
    │   ├── network/                  VPC, subredes, NAT, endpoint S3, flow logs
    │   ├── ecr/                      repositorio de imágenes
    │   ├── documents-bucket/         S3 + KMS para documentos KYC
    │   ├── database/                 RDS PostgreSQL y sus grupos de logs
    │   ├── service-runtime/          ECS Fargate + ALB + autoescalado
    │   ├── api-domain/               certificado ACM + validación y alias en Route 53
    │   ├── web-acl/                  WAF: rate limit y reglas administradas
    │   ├── audit-trail/              CloudTrail + alarmas de seguridad (CIS)
    │   ├── newrelic-aws-integration/ cuenta AWS ↔ New Relic: metric streams y logs por Firehose
    │   ├── newrelic-observability/   alertas, SLO, monitor sintético y dashboard en New Relic
    │   ├── log-forwarding/           suscripción de grupos de logs al Firehose de New Relic
    │   └── observability/            alarmas de CloudWatch (respaldo)
    ├── live/
    │   ├── dev/us-east-1/account/    auditoría en floci, secreto de New Relic de dev
    │   ├── dev/us-east-1/api/        la API en floci (estado local)
    │   ├── prd/us-east-1/account/    auditoría e integración con New Relic (una vez por cuenta)
    │   └── prd/us-east-1/api/        la API, el dominio y su observabilidad (estado en S3)
    ├── bootstrap/                    una vez por cuenta: bucket del estado y roles OIDC
    ├── .tflint.hcl                   reglas de tflint
    └── .checkov.yaml                 escaneo de seguridad y excepciones con su motivo
```

**Reglas:**

- **Dependencias:** los stacks conocen los módulos; los módulos no se conocen entre sí. Todo pasa por variables y outputs, y cada módulo documenta su contrato en su README.
- **Valores fijos:** ningún módulo escribe cuentas, regiones, dominios, CIDR ni umbrales; llegan desde el stack.
- **Entre stacks:** `account` y `api` se conectan por nombres de convención, sin leer el estado del otro. Son el secreto `ayni-<env>/newrelic/license-key`, el Firehose `ayni-prd-newrelic-logs` y el bucket de documentos. Por eso **`account` se aplica antes que `api`**.
- **Versiones de los módulos:** al estar en el mismo repositorio que los stacks, se consumen por ruta relativa. Un apply de prd siempre corre desde un commit concreto de `main`, que es la referencia inmutable. Si otro repositorio llega a consumirlos, se publican con tags SemVer (`infra-modules-vX.Y.Z`).
- **Versiones fijadas:** Terraform ≥ 1.10 (CI usa 1.13.0), provider AWS `~> 6.68.0` y New Relic `~> 3.100.0`. Los `.terraform.lock.hcl` de los stacks se versionan con hashes de Linux, Windows y macOS.

## Observabilidad

| Señal | Dónde | Para qué |
| --- | --- | --- |
| Trazas, métricas y logs de la API | New Relic, por OTLP desde la app (COPAYNI-10) | Diagnóstico por petición, correlacionado por `traceId`. |
| Métricas de AWS (ECS, ALB, RDS, WAF, NAT) | New Relic, por CloudWatch Metric Streams | Infraestructura en el mismo lugar que la aplicación. |
| Logs de WAF, PostgreSQL, flow logs y CloudTrail | New Relic, por Firehose | Búsqueda unificada. Los logs de la API no se reenvían porque ya llegan por OTLP. |
| **Alertas principales** | New Relic: errores y latencia p95, SLO de disponibilidad y latencia, monitor sintético externo, infraestructura | Un solo lugar de alertas, con runbook en cada condición. |
| Alertas de respaldo | CloudWatch: targets no sanos y almacenamiento de la base | Avisan aunque New Relic no esté disponible. |
| Auditoría | CloudTrail: gestión en todas las regiones, más los accesos a documentos KYC | Quién hizo qué. Siete alarmas de seguridad (CIS). |

Runbooks: [API](../../docs/runbooks/api.md) y [seguridad](../../docs/runbooks/security.md).

**Credenciales de New Relic:**

- **User API key:** con ella Terraform crea alertas, dashboards y el vínculo de la cuenta. Llega como variable efímera (`TF_VAR_new_relic_api_key`), así que no queda en el estado ni en el plan.
- **License key de ingesta:** la usan la API y Firehose. Vive en Secrets Manager con el formato `{"api_key": "…"}` y se carga fuera de Terraform.

## dev: floci en tu máquina

**Requisitos:** Docker y Terraform ≥ 1.10.

**Primera vez:**

```bash
# 1. Emulador (persistente entre reinicios)
docker compose -f infra/local/compose.yaml up -d

# 2. Stack de cuenta (auditoría)
cd infra/terraform/live/dev/us-east-1/account
terraform init && terraform apply

# 3. Repositorio de imágenes: el servicio ECS necesita la imagen antes de existir
cd ../api
terraform init
terraform apply -target=module.ecr

# 4. Imagen de la API
docker build -t ayni-api:local ../../../../../../apps/backend
docker tag ayni-api:local "$(terraform output -raw ecr_repository_url):local"
docker push "$(terraform output -raw ecr_repository_url):local"

# 5. Todo el stack
terraform apply
```

**Barreras contra AWS real:** el provider de dev usa credenciales fijas de prueba, que tienen prioridad sobre `AWS_PROFILE` y `~/.aws`. Además, `emulator_endpoint` solo admite `localhost`, `127.0.0.1` o `floci`. Así, un apply de dev no puede llegar a una cuenta real, aunque el perfil por defecto de la máquina apunte a una.

**New Relic en dev (opcional, con tu cuenta de dev).** La API de dev envía su telemetría y se crean alertas, SLO y dashboard en esa cuenta. No hay monitor sintético (dev no es accesible desde internet) ni métricas de AWS (New Relic no puede leer el emulador).

1. En `account/terraform.tfvars`, poner `new_relic_enabled = true` y aplicar.
2. Cargar la license key en floci:

   ```bash
   aws --endpoint-url http://localhost:4566 secretsmanager put-secret-value \
     --secret-id ayni-dev/newrelic/license-key --secret-string '{"api_key":"<license key>"}'
   ```

   Usar las credenciales de prueba `AWS_ACCESS_KEY_ID=test` y `AWS_SECRET_ACCESS_KEY=test`, nunca tu perfil.
3. En `api/terraform.tfvars`, poner `new_relic = { enabled = true, account_id = <cuenta>, region = "US" }`, y luego `export TF_VAR_new_relic_api_key=<User API key>` y `terraform apply`.
4. Cuando la API ya haya reportado, activar `slo = { enabled = true }`.

**Qué se puede probar en dev:**

| Pieza | Comportamiento en floci 2.2.0 |
| --- | --- |
| ECS | La tarea corre como contenedor real, con el health check de la task definition. |
| RDS | PostgreSQL 17.6 real en `localhost:<database_port>` (rango 7001 a 7099). La credencial está en el secreto que gestiona RDS (`database_master_secret_arn`). |
| ECR | Registry real en `localhost:4566/<cuenta>/<región>/<repo>`. |
| CloudTrail | El trail queda registrando y los filtros de seguridad se crean. |
| S3, KMS, Secrets Manager, IAM, alarmas | API emulada: Terraform crea y lee los recursos. |

**Comandos útiles:**

```bash
# Logs de la API
docker logs -f $(docker ps -q --filter name=floci-aws-ecs)
# Probar la API desde dentro del contenedor (el ALB emulado no enruta a ECS)
docker exec $(docker ps -q --filter name=floci-aws-ecs) wget -qO- http://127.0.0.1:3000/health/live
# Nueva versión de la API: etiqueta nueva (el repositorio es inmutable)
docker tag ayni-api:local "$(terraform output -raw ecr_repository_url):<tag>" && docker push ...
terraform apply -var image_tag=<tag>
# Empezar de cero: primero api, después account
terraform destroy && (cd ../account && terraform destroy) && docker compose -f infra/local/compose.yaml down -v
```

**Disco en Windows:** cada `terraform init` copia el provider de AWS (~800 MB) al `.terraform/` de ese directorio. Borrar los `.terraform/` de módulos que ya no se usan; se regeneran con `init`.

**Diferencias conocidas con AWS.** Solo se pueden verificar en prd:

- **ALB:** el balanceador emulado no enruta tráfico a ECS.
- **TLS y parameter groups:** RDS no aplica los parameter groups, así que no exige TLS (`rds.force_ssl`) ni registra las consultas lentas.
- **Políticas:** IAM, las políticas de S3 y la WAF se guardan pero no se aplican.
- **CloudTrail:** no devuelve la integración con CloudWatch Logs ni la clave KMS del trail, así que las alarmas de seguridad no se disparan en dev.
- **Plan después de un apply:** `terraform plan` muestra cambios que no son reales:
  - 6 en el stack api: floci devuelve el security group referenciado como `cuenta/sg-…`, reporta gp2 en lugar de gp3, y no devuelve todos los campos de los parameter groups ni de la alarma de latencia;
  - 1 en el stack account: el trail.

## prd: AWS y New Relic

Antes del primer despliegue hay que completar los valores marcados `CAMBIAR`: la cuenta AWS dedicada, la cuenta de New Relic, el owner y el centro de costos. Con los valores de ejemplo, el plan falla a propósito.

**Orden de aplicación:** `bootstrap` → `account` → `api`.

**1. Bootstrap.** Lo aplica un administrador, una vez y con credenciales de la cuenta dedicada; nunca con el perfil por defecto de una laptop.

```bash
cd infra/terraform/bootstrap
# Completar terraform.tfvars (cuenta, owner, centro de costos)
terraform init && terraform apply
# Migrar el propio estado al bucket creado (antes, cambiar backend "local" por backend "s3" en versions.tf)
terraform init -migrate-state \
  -backend-config="bucket=$(terraform output -raw state_bucket)" \
  -backend-config="key=bootstrap/terraform.tfstate" -backend-config="region=us-east-1"
```

**2. GitHub.**

- Crear el environment `prd` con revisores obligatorios.
- Cargar los secretos:
  - `AWS_PLAN_ROLE_ARN`, en el repositorio;
  - `AWS_APPLY_ROLE_ARN`, en el environment `prd`;
  - `NEW_RELIC_API_KEY`, una User API key de la cuenta de prd, en el environment `prd`.
  - Los dos roles salen de los outputs de bootstrap.
- Poner el bucket real en los `backend.hcl` de `account` y `api`.

**3. Stack account.** El primer apply se hace en dos pasos, porque Firehose necesita la license key ya cargada:

```bash
terraform apply -target=aws_secretsmanager_secret.newrelic_license_key
aws secretsmanager put-secret-value --secret-id ayni-prd/newrelic/license-key \
  --secret-string '{"api_key":"<license key de ingesta>"}'
terraform apply
```

Crea el trail, las alarmas de seguridad y la integración con New Relic. En New Relic aparece la cuenta AWS vinculada por metric streams.

**4. Dominio `backend-ayni.solutionserj.com`, delegado desde GoDaddy.** El resto de `solutionserj.com` sigue en GoDaddy; solo este nombre pasa a Route 53, y Terraform administra la validación del certificado y el alias al balanceador. Un solo paso es manual:

1. Crear solo la zona: `terraform apply -target=aws_route53_zone.api`.
2. En GoDaddy, en la zona DNS de `solutionserj.com`, crear **4 registros NS** con nombre `backend-ayni`, uno por cada servidor de `terraform output route53_name_servers`.
3. Verificar con `dig NS backend-ayni.solutionserj.com +short`: tiene que devolver los servidores de Route 53.
4. Hacer el apply completo. Espera la emisión del certificado, hasta 60 minutos.

La API se publica solo por HTTPS; HTTP redirige con un 301. Si se recrea el balanceador o el certificado, ya no hace falta tocar GoDaddy.

**5. Stack api y despliegue.** Pipeline de COPAYNI-12, pendiente de la cuenta:

1. Build y push de la imagen con el SHA.
2. Plan con el rol de plan: `terraform plan -var image_tag=<sha> -out=tfplan`.
3. Aprobación del environment `prd`.
4. Apply de ese plan exacto con el rol de apply.
5. Smoke test de `/health/ready`.

No se aplica prd desde una laptop.

**6. SLO.** Cuando la API ya reportó a New Relic (después del primer despliegue), poner `slo = { enabled = true }` en `api/terraform.tfvars` y aplicar. El SLO se asocia a la entidad del servicio, que New Relic crea al recibir la primera telemetría.

## Calidad (job `infra` de CI)

| Paso | Qué valida |
| --- | --- |
| `terraform fmt -check` | Formato. |
| `validate` | Cada módulo y cada stack. |
| `terraform test` | Con providers simulados: módulos, composición de prd (`account` y `api`), seguridad por defecto, ramas de cada interruptor, validaciones de entrada y controles exclusivos de prd. |
| tflint 0.64.0 + ruleset AWS 0.49.0 | Convenciones, variables y outputs documentados, tipos de instancia válidos. |
| checkov 3.3.28 | Seguridad. Las excepciones están en `.checkov.yaml`, cada una con su motivo. |
| `docker build` | La imagen de la API compila. |

Para correrlo en local:

```bash
cd infra/terraform
terraform fmt -check -recursive
for d in modules/*/ live/*/*/*/ bootstrap/; do terraform -chdir=$d init -backend=false && terraform -chdir=$d validate; [ -d $d/tests ] && terraform -chdir=$d test; done
docker run --rm -v "$PWD:/data" -w /data --entrypoint sh ghcr.io/terraform-linters/tflint:v0.64.0 -c 'tflint --init --config /data/.tflint.hcl && tflint --recursive --config /data/.tflint.hcl'
docker run --rm -v "$PWD:/tf" -w /tf bridgecrew/checkov:3.3.28 --config-file /tf/.checkov.yaml -d /tf
```

## Pendiente

- **Valores `CAMBIAR`:** la cuenta AWS dedicada (ADR, D2), la cuenta de New Relic de prd, el owner y el centro de costos.
- **Workflow de despliegue de prd** (plan en PR, apply con aprobación), cuando exista la cuenta.
- **Nombres de las métricas de AWS en New Relic:** las condiciones de infraestructura usan la convención `aws.<servicio>.<Métrica>` de los metric streams. Confirmar con los primeros datos y ajustar si New Relic los nombra distinto.
- **DNSSEC** de la zona delegada: requiere publicar el registro DS en GoDaddy.
- **Indicador de base de datos en `/health/ready` y migraciones como tarea ECS:** llegan con la persistencia de COPAYNI-24.
- **Tareas programadas** (EventBridge Scheduler, ADR §6): módulo `scheduled-task` cuando exista el primer job.
- **Dashboards de mobile y negocio:** cuando la app y los pagos estén instrumentados.
- **Access logs del ALB y replicación entre regiones:** ver las excepciones en `.checkov.yaml`.
