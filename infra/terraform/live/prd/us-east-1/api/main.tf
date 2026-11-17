locals {
  name = "ayni-prd"

  tags = {
    Application        = "ayni"
    Environment        = "prd"
    Owner              = var.owner
    CostCenter         = var.cost_center
    DataClassification = "confidential"
    ManagedBy          = "terraform"
    Repository         = "gh0st1608/fintech-ayni"
  }
}

module "network" {
  source = "../../../../modules/network"

  name               = local.name
  cidr_block         = "10.40.0.0/16"
  availability_zones = ["${var.region}a", "${var.region}b"]
  # Un NAT compartido al inicio (ADR, Riesgos): revisar a los 3 meses con datos de uso.
  nat_gateway_mode         = "single"
  flow_logs_retention_days = 30
}

module "ecr" {
  source = "../../../../modules/ecr"

  name        = "${local.name}/api"
  keep_images = 30
}

module "documents" {
  source = "../../../../modules/documents-bucket"

  bucket_name = "${local.name}-documents-${var.aws_account_id}"
  # Retención de versiones: pendiente de Legal (pending-scope L5).
  noncurrent_version_expiration_days = null
}

# Envío real del OTP (pending-scope T6). Sin var.otp_messaging no crea nada y la API responde 503
# al pedir un código. La identidad de SMS se registra fuera de Terraform (README del módulo).
locals {
  otp_enabled = var.otp_messaging.email != null || var.otp_messaging.sms != null

  # Permisos de la aplicación (rol de la tarea de la API y de sus tareas programadas).
  api_task_policies = merge(
    { documents = module.documents.read_write_policy_json },
    local.otp_enabled ? { otp = module.otp_messaging.send_policy_json } : {},
  )
}

module "otp_messaging" {
  source = "../../../../modules/otp-messaging"

  name  = local.name
  email = var.otp_messaging.email
  sms   = var.otp_messaging.sms
  tags  = local.tags
}

module "database" {
  source = "../../../../modules/database"

  name                         = local.name
  vpc_id                       = module.network.vpc_id
  subnet_ids                   = module.network.private_subnet_ids
  allowed_security_groups      = { api = module.api.security_group_id, migrate = aws_security_group.migrate.id }
  instance_class               = "db.t4g.small"
  allocated_storage            = 50
  max_allocated_storage        = 200
  multi_az                     = true
  backup_retention_days        = 30
  deletion_protection          = true
  performance_insights_enabled = true
  monitoring_interval          = 60
}

# Telemetría de la API a New Relic (COPAYNI-10). El secreto lo crea el stack account.
locals {
  otlp_endpoints = {
    US = "https://otlp.nr-data.net:4318"
    EU = "https://otlp.eu01.nr-data.net:4318"
  }

  telemetry_environment = var.new_relic.enabled ? {
    ENABLE_TRACING              = "true"
    ENABLE_METRICS              = "true"
    ENABLE_LOGGING              = "true"
    OTEL_EXPORTER_OTLP_ENDPOINT = local.otlp_endpoints[var.new_relic.region]
    } : {
    ENABLE_TRACING = "false"
    ENABLE_METRICS = "false"
    ENABLE_LOGGING = "false"
  }
}

data "aws_secretsmanager_secret" "newrelic_license_key" {
  count = var.new_relic.enabled ? 1 : 0

  name = "${local.name}/newrelic/license-key"
}

# Secretos de la API. Igual que la license key de New Relic, Terraform crea el contenedor y el
# valor se carga fuera del estado (README, scripts/load-app-secrets.sh). Son dos y no uno para que
# la credencial de la base se pueda rotar sin tocar las claves criptográficas.
resource "aws_secretsmanager_secret" "api" {
  name        = "${local.name}/api/secrets"
  description = "Claves de la API: {\"jwt_private_key\": \"...\", \"otp_pepper\": \"...\", \"field_encryption_key\": \"...\"}"
  tags        = local.tags
}

# Usuario con el que la API se conecta a la base. Lo crea el runner de migraciones con la
# credencial maestra; aquí solo vive su contraseña (COPAYNI-12).
resource "aws_secretsmanager_secret" "database_app_user" {
  name        = "${local.name}/db/app"
  description = "Usuario de aplicación de PostgreSQL: {\"username\": \"...\", \"password\": \"...\"}"
  tags        = local.tags
}

locals {
  # La base exige TLS (rds.force_ssl) y la raíz de Amazon RDS no está en el almacén de Node: la
  # imagen trae el bundle y la API lo lee de esta ruta.
  database_environment = {
    DB_HOST        = module.database.address
    DB_PORT        = tostring(module.database.port)
    DB_NAME        = module.database.database_name
    DB_SSL         = "true"
    DB_SSL_CA_FILE = "/app/certs/rds-ca.pem"
  }

  # La API nunca ve la credencial maestra: solo la del usuario de aplicación.
  database_secrets = {
    DB_USERNAME = "${aws_secretsmanager_secret.database_app_user.arn}:username::"
    DB_PASSWORD = "${aws_secretsmanager_secret.database_app_user.arn}:password::"
  }

  app_secrets = {
    JWT_PRIVATE_KEY      = "${aws_secretsmanager_secret.api.arn}:jwt_private_key::"
    OTP_PEPPER           = "${aws_secretsmanager_secret.api.arn}:otp_pepper::"
    FIELD_ENCRYPTION_KEY = "${aws_secretsmanager_secret.api.arn}:field_encryption_key::"
  }
}

# La misma configuración para la API y sus tareas programadas.
locals {
  api_environment = merge(var.app_config, local.telemetry_environment, local.database_environment, {
    DEPLOYMENT_ENVIRONMENT = "prod"
    NODE_ENV               = "production"
    PORT                   = "3000"
    TRUST_PROXY            = "true"
    # Documentos KYC en el bucket de este stack (COPAYNI-43). Sin proveedor de verificación
    # (COPAYNI-42), los documentos quedan en revisión manual.
    AWS_REGION       = var.region
    DOCUMENT_STORAGE = "s3"
    DOCUMENTS_BUCKET = module.documents.bucket_name
    KYC_PROVIDER     = "manual"
    ENABLE_SWAGGER   = "false"
  }, module.otp_messaging.app_environment)
  api_secrets = merge(local.database_secrets, local.app_secrets, var.new_relic.enabled ? {
    NEW_RELIC_LICENSE_KEY = "${data.aws_secretsmanager_secret.newrelic_license_key[0].arn}:api_key::"
  } : {})
}

# Zona delegada: en GoDaddy, el nombre backend-ayni apunta por NS a estos servidores (README).
# El resto de solutionserj.com sigue en GoDaddy.
resource "aws_route53_zone" "api" {
  name    = var.api_domain_name
  comment = "API de Ayni, delegada desde GoDaddy"
}

module "api_domain" {
  source = "../../../../modules/api-domain"

  domain_name  = var.api_domain_name
  route53      = { zone_id = aws_route53_zone.api.zone_id }
  alb_dns_name = module.api.alb_dns_name
  alb_zone_id  = module.api.alb_zone_id
}

module "web_acl" {
  source = "../../../../modules/web-acl"

  name = "${local.name}-api"

  # /admin no tiene filtro de red (BO8, COPAYNI-74): esta es la primera contención, por IP y por
  # delante de la aplicación. La segunda es ADMIN_RATE_LIMIT_MAX, dentro de la API.
  path_rate_limits = {
    admin = {
      path_prefix              = "/admin/"
      rate_limit_per_5_minutes = 600
    }
  }
}

# Zona propia del back-office, creada por el stack dns y delegada desde GoDaddy. Se busca por
# nombre para no acoplar este stack al estado del otro.
data "aws_route53_zone" "backoffice" {
  name         = var.backoffice_domain_name
  private_zone = false
}

# Back-office: sitio estático en CloudFront sobre un bucket privado, en el ápice de su propia zona.
# Sin filtro de red (BO8): la puerta es el login corporativo con MFA (COPAYNI-72).
module "backoffice" {
  source = "../../../../modules/static-site"

  name        = "${local.name}-backoffice"
  bucket_name = "${local.name}-backoffice-${var.aws_account_id}"
  domain_name = var.backoffice_domain_name
  route53     = { zone_id = data.aws_route53_zone.backoffice.zone_id }
  tags        = local.tags

  # Sin estos orígenes la CSP corta las llamadas del sitio: la API y el proveedor de identidad.
  connect_src = compact([
    "https://${var.api_domain_name}",
    var.backoffice_oidc_issuer,
  ])
}

module "api" {
  source = "../../../../modules/service-runtime"

  name               = "${local.name}-api"
  vpc_id             = module.network.vpc_id
  alb_subnet_ids     = module.network.public_subnet_ids
  service_subnet_ids = module.network.private_subnet_ids
  assign_public_ip   = false

  image         = "${module.ecr.repository_url}:${var.image_tag}"
  cpu           = 512
  memory        = 1024
  desired_count = 2
  autoscaling = {
    min_capacity       = 2
    max_capacity       = 4
    cpu_target_percent = 60
  }
  task_policies = local.api_task_policies

  environment = local.api_environment
  secrets     = local.api_secrets

  https                   = { certificate_arn = module.api_domain.certificate_arn }
  waf                     = { web_acl_arn = module.web_acl.web_acl_arn }
  alb_deletion_protection = true
  log_retention_days      = 90
  wait_for_steady_state   = true
}

# Grupo propio y no el del servicio: así la tarea de migración no depende de la API y el
# despliegue puede aplicarla y migrar antes de actualizar el servicio.
# Sin reglas de entrada: nadie se conecta a la tarea.
resource "aws_security_group" "migrate" {
  #checkov:skip=CKV2_AWS_5:No lo referencia ningún recurso porque la tarea no es un servicio: se lo pasa aws ecs run-task al lanzarla, desde el workflow de despliegue y desde el runbook.
  name        = "${local.name}-api-migrate"
  description = "Tarea de migraciones: sale a la base, a ECR y a Secrets Manager"
  vpc_id      = module.network.vpc_id
  tags        = local.tags
}

resource "aws_vpc_security_group_egress_rule" "migrate" {
  security_group_id = aws_security_group.migrate.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Salida a la base y a los servicios de AWS"
}

locals {
  # Exactamente la misma configuración que la API, con dos añadidos. Así la migración hace de
  # canario: el runner valida el entorno al arrancar, de modo que una variable mal puesta detiene
  # el despliegue aquí en vez de dejar al servicio reiniciándose en bucle.
  migrate_environment = merge(local.api_environment, {
    # Crea o actualiza el usuario con el que se conecta la API, y le da permisos sobre las tablas
    # que acaban de migrarse.
    DB_APP_USERNAME = var.database_app_username
  })

  # La credencial maestra pisa la del usuario de aplicación: migrar necesita DDL.
  migrate_secrets = merge(local.api_secrets, {
    DB_USERNAME     = "${module.database.master_user_secret_arn}:username::"
    DB_PASSWORD     = "${module.database.master_user_secret_arn}:password::"
    DB_APP_PASSWORD = "${aws_secretsmanager_secret.database_app_user.arn}:password::"
  })
}

# Migraciones de la base (COPAYNI-12). El pipeline la lanza antes de actualizar el servicio: si
# falla, el despliegue se detiene y la versión anterior sigue sirviendo. Es la única tarea que usa
# la credencial maestra de RDS, y por eso tiene su propio rol de ejecución.
module "migrate" {
  source = "../../../../modules/one-off-task"

  name    = "${local.name}-api-migrate"
  image   = "${module.ecr.repository_url}:${var.image_tag}"
  command = ["node", "dist/migrate.js"]
  tags    = local.tags

  environment = local.migrate_environment
  secrets     = local.migrate_secrets
}

# Ciclo mensual de los círculos (COPAYNI-56). Deshabilitado hasta que exista el adaptador real de
# cobros: CIRCLE_PAYMENTS_ADAPTER solo admite fake, que no corre en production.
module "circle_cycle" {
  source = "../../../../modules/scheduled-task"

  name                = "${local.name}-circle-cycle"
  enabled             = var.circle_cycle_enabled
  schedule_expression = "cron(0 6 * * ? *)"
  schedule_timezone   = "America/Lima" # BUSINESS_TIME_ZONE

  cluster_arn        = module.api.cluster_arn
  image              = "${module.ecr.repository_url}:${var.image_tag}"
  command            = ["node", "dist/jobs/circle-cycle.js"]
  cpu                = 512
  memory             = 1024
  environment        = local.api_environment
  secrets            = local.api_secrets
  execution_role_arn = module.api.execution_role_arn
  task_role_arn      = module.api.task_role_arn
  log_group_name     = module.api.log_group_name
  subnet_ids         = module.network.private_subnet_ids
  security_group_ids = [module.api.security_group_id]
  alarm_enabled      = true
  alarm_topic_arn    = module.observability.notification_topic_arn
}

# Respaldo en CloudWatch: avisa aunque New Relic no esté disponible. El resto de las alertas
# está en New Relic.
module "observability" {
  source = "../../../../modules/observability"

  name        = "${local.name}-api"
  alarm_names = ["api-unhealthy-targets", "db-storage-low"]

  ecs = {
    cluster_name = module.api.cluster_name
    service_name = module.api.service_name
  }
  alb = {
    arn_suffix              = module.api.alb_arn_suffix
    target_group_arn_suffix = module.api.target_group_arn_suffix
  }
  db_instance_identifier = module.database.instance_identifier
  notification_emails    = var.alert_emails
  alarm_config           = var.alarm_config
  runbook_base_url       = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/api.md"
}

module "newrelic" {
  source = "../../../../modules/newrelic-observability"

  name                = "${local.name}-api"
  enabled             = var.new_relic.enabled
  account_id          = var.new_relic.account_id
  service_name        = var.app_config["APP_NAME"]
  environment         = "prod"
  notification_emails = var.alert_emails
  slo                 = var.slo
  synthetics          = { url = "https://${var.api_domain_name}/health/live" }
  aws_infra = {
    ecs_cluster_name       = module.api.cluster_name
    ecs_service_name       = module.api.service_name
    alb_arn_suffix         = module.api.alb_arn_suffix
    db_instance_identifier = module.database.instance_identifier
  }
  runbook_base_url = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/api.md"
}

# Logs de infraestructura a New Relic por el Firehose del stack account. Los de la API no:
# ya llegan por OTLP.
data "aws_kinesis_firehose_delivery_stream" "newrelic_logs" {
  count = var.new_relic.enabled ? 1 : 0

  name = "${local.name}-newrelic-logs"
}

data "aws_iam_role" "newrelic_logs_subscription" {
  count = var.new_relic.enabled ? 1 : 0

  name = "${local.name}-newrelic-logs-subscription"
}

module "logs_to_newrelic" {
  source = "../../../../modules/log-forwarding"
  count  = var.new_relic.enabled ? 1 : 0

  name = "${local.name}-newrelic"
  log_groups = {
    waf       = module.web_acl.log_group_name
    postgres  = module.database.log_group_names["postgresql"]
    flow-logs = module.network.flow_logs_log_group_name
  }
  destination_arn = data.aws_kinesis_firehose_delivery_stream.newrelic_logs[0].arn
  role_arn        = data.aws_iam_role.newrelic_logs_subscription[0].arn
}
