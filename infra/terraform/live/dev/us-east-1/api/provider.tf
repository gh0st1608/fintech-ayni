# dev corre contra floci (infra/local/compose.yaml), nunca contra AWS.
#
# Barreras para no tocar una cuenta real (el perfil por defecto de la máquina puede ser otro):
# - credenciales fijas de prueba: tienen prioridad sobre AWS_PROFILE y ~/.aws;
# - el endpoint solo admite el host local;
# - cada servicio usado tiene su endpoint; uno faltante falla con credenciales inválidas en AWS.
provider "aws" {
  region     = var.region
  access_key = "test"
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    acm            = var.emulator_endpoint
    appautoscaling = var.emulator_endpoint
    cloudtrail     = var.emulator_endpoint
    cloudwatch     = var.emulator_endpoint
    ec2            = var.emulator_endpoint
    ecr            = var.emulator_endpoint
    ecs            = var.emulator_endpoint
    elbv2          = var.emulator_endpoint
    iam            = var.emulator_endpoint
    kms            = var.emulator_endpoint
    logs           = var.emulator_endpoint
    rds            = var.emulator_endpoint
    route53        = var.emulator_endpoint
    s3             = var.emulator_endpoint
    secretsmanager = var.emulator_endpoint
    sns            = var.emulator_endpoint
    ssm            = var.emulator_endpoint
    sts            = var.emulator_endpoint
    wafv2          = var.emulator_endpoint
  }

  default_tags {
    tags = local.tags
  }
}

# Con New Relic desactivado no se crea nada en New Relic: los valores ficticios solo evitan pedir
# la cuenta y la key.
provider "newrelic" {
  account_id = var.new_relic.enabled ? var.new_relic.account_id : 1
  region     = var.new_relic.region
  api_key    = var.new_relic.enabled ? var.new_relic_api_key : "NRAK-DESACTIVADO"
}
