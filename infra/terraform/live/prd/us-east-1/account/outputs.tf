output "cloudtrail_bucket" {
  description = "Bucket con la copia íntegra de los eventos de auditoría."
  value       = module.audit_trail.bucket_name
}

output "security_topic_arn" {
  description = "Tópico de las alarmas de seguridad."
  value       = module.audit_trail.security_topic_arn
}

output "newrelic_license_key_secret" {
  description = "Secreto donde se carga la license key de New Relic (README)."
  value       = var.new_relic.enabled ? aws_secretsmanager_secret.newrelic_license_key[0].name : null
}
