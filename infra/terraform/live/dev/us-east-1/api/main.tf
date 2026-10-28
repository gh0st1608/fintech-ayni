locals {
  name = "ayni-dev"

  tags = {
    Application        = "ayni"
    Environment        = "dev"
    Owner              = "equipo-ayni"
    CostCenter         = "ayni"
    DataClassification = "test"
    ManagedBy          = "terraform"
    Repository         = "gh0st1608/fintech-ayni"
  }
}

module "network" {
  source = "../../../../modules/network"

  name               = local.name
  cidr_block         = "10.10.0.0/16"
  availability_zones = ["${var.region}a", "${var.region}b"]
  # Sin NAT: las tareas van en subredes públicas (ADR, Red).
  nat_gateway_mode = "none"
}

module "ecr" {
  source = "../../../../modules/ecr"

  name         = "${local.name}/api"
  keep_images  = 5
  force_delete = true
}

module "documents" {
  source = "../../../../modules/documents-bucket"

  bucket_name              = "${local.name}-documents"
  force_destroy            = true
  kms_deletion_window_days = 7
}

module "database" {
  source = "../../../../modules/database"

  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.private_subnet_ids
  allowed_security_groups = { api = module.api.security_group_id }
  deletion_protection     = false
  skip_final_snapshot     = true
  backup_retention_days   = 1
}

# Telemetría de la API a la cuenta de New Relic de dev. El secreto lo crea el stack account.
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

module "api" {
  source = "../../../../modules/service-runtime"

  name               = "${local.name}-api"
  vpc_id             = module.network.vpc_id
  alb_subnet_ids     = module.network.public_subnet_ids
  service_subnet_ids = module.network.public_subnet_ids
  assign_public_ip   = true

  image         = "${module.ecr.repository_url}:${var.image_tag}"
  task_policies = { documents = module.documents.read_write_policy_json }

  environment = merge(var.app_config, local.telemetry_environment, {
    DEPLOYMENT_ENVIRONMENT = "dev"
    NODE_ENV               = "production"
    PORT                   = "3000"
    TRUST_PROXY            = "true"
  })

  secrets = var.new_relic.enabled ? {
    NEW_RELIC_LICENSE_KEY = "${data.aws_secretsmanager_secret.newrelic_license_key[0].arn}:api_key::"
  } : {}

  # Sin certificado: el emulador no tiene DNS público. HTTP solo en dev.
  https                   = null
  alb_deletion_protection = false
  log_retention_days      = 7
}

# Respaldo en CloudWatch, igual que prd.
module "observability" {
  source = "../../../../modules/observability"

  name        = "${local.name}-api"
  enabled     = var.observability_enabled
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
  runbook_base_url       = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/api.md"
}

# Alertas, SLO y dashboard de la API en la cuenta de New Relic de dev. Sin monitor sintético
# (dev no es accesible desde internet) ni métricas de infraestructura (no hay metric streams).
module "newrelic" {
  source = "../../../../modules/newrelic-observability"

  name                = "${local.name}-api"
  enabled             = var.new_relic.enabled
  account_id          = var.new_relic.account_id
  service_name        = var.app_config["APP_NAME"]
  environment         = "dev"
  notification_emails = var.alert_emails
  slo                 = var.slo
  runbook_base_url    = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/api.md"
}
