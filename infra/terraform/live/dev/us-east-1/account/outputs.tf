output "cloudtrail_bucket" {
  description = "Bucket de auditoría."
  value       = module.audit_trail.bucket_name
}

output "newrelic_license_key_secret" {
  description = "Secreto donde se carga la license key de New Relic de dev (README)."
  value       = var.new_relic_enabled ? aws_secretsmanager_secret.newrelic_license_key[0].name : null
}
