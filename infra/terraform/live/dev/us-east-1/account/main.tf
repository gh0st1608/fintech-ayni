# Recursos de cuenta en floci: auditoría y el secreto de New Relic de dev. La integración de AWS
# con New Relic (metric streams) no existe en dev: New Relic no puede leer el emulador local.
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

module "audit_trail" {
  source = "../../../../modules/audit-trail"

  name                    = local.name
  data_event_bucket_names = ["${local.name}-documents"]
  s3_retention_days       = 90
  force_destroy           = true
  runbook_base_url        = "https://github.com/gh0st1608/fintech-ayni/blob/main/docs/runbooks/security.md"
}

# License key de la cuenta de New Relic de dev, en formato {"api_key": "…"} (README).
resource "aws_secretsmanager_secret" "newrelic_license_key" {
  count = var.new_relic_enabled ? 1 : 0

  name                    = "${local.name}/newrelic/license-key"
  description             = "License key de ingesta de New Relic (dev): {\"api_key\": \"...\"}"
  recovery_window_in_days = 0
}
