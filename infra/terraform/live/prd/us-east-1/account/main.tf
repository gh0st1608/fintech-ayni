# Recursos que existen una vez por cuenta: auditoría y la integración con New Relic.
# Se aplica antes que el stack api (README, orden de los stacks).
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

module "audit_trail" {
  source = "../../../../modules/audit-trail"

  name = local.name
  # Accesos a los documentos KYC: el bucket del stack api (mismo nombre por convención).
  data_event_bucket_names = ["${local.name}-documents-${var.aws_account_id}"]
  # Sus cambios de IAM y security groups ya pasaron por un plan aprobado.
  trusted_role_names  = ["${local.name}-terraform-apply"]
  notification_emails = var.security_emails
  runbook_base_url    = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/security.md"
}

# License key de ingesta de New Relic, en formato {"api_key": "…"}: la leen Firehose y la API
# (valueFrom …:api_key::). El valor se carga fuera de Terraform (README).
resource "aws_secretsmanager_secret" "newrelic_license_key" {
  count = var.new_relic.enabled ? 1 : 0

  name        = "${local.name}/newrelic/license-key"
  description = "License key de ingesta de New Relic: {\"api_key\": \"...\"}"
}

module "newrelic_aws" {
  source = "../../../../modules/newrelic-aws-integration"
  count  = var.new_relic.enabled ? 1 : 0

  name                   = local.name
  newrelic_account_id    = var.new_relic.account_id
  newrelic_region        = var.new_relic.region
  license_key_secret_arn = aws_secretsmanager_secret.newrelic_license_key[0].arn
}

module "cloudtrail_to_newrelic" {
  source = "../../../../modules/log-forwarding"
  count  = var.new_relic.enabled ? 1 : 0

  name            = "${local.name}-newrelic"
  log_groups      = { cloudtrail = module.audit_trail.log_group_name }
  destination_arn = module.newrelic_aws[0].logs_firehose_arn
  role_arn        = module.newrelic_aws[0].logs_subscription_role_arn
}
