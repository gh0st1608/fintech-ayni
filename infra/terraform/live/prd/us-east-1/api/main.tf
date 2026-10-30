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

module "database" {
  source = "../../../../modules/database"

  name                         = local.name
  vpc_id                       = module.network.vpc_id
  subnet_ids                   = module.network.private_subnet_ids
  allowed_security_groups      = { api = module.api.security_group_id }
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
  task_policies = { documents = module.documents.read_write_policy_json }

  environment = merge(var.app_config, local.telemetry_environment, {
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
  })
  secrets = var.new_relic.enabled ? {
    NEW_RELIC_LICENSE_KEY = "${data.aws_secretsmanager_secret.newrelic_license_key[0].arn}:api_key::"
  } : {}

  https                   = { certificate_arn = module.api_domain.certificate_arn }
  waf                     = { web_acl_arn = module.web_acl.web_acl_arn }
  alb_deletion_protection = true
  log_retention_days      = 90
  wait_for_steady_state   = true
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
