output "linked_account_id" {
  description = "ID del vínculo de la cuenta AWS en New Relic."
  value       = newrelic_cloud_aws_link_account.this.id
}

output "logs_firehose_arn" {
  description = "Firehose de logs: destino de log-forwarding (null si logs_enabled = false)."
  value       = var.logs_enabled ? aws_kinesis_firehose_delivery_stream.this["logs"].arn : null
}

output "logs_subscription_role_arn" {
  description = "Rol de suscripción de CloudWatch Logs (null si logs_enabled = false)."
  value       = var.logs_enabled ? aws_iam_role.logs_subscription[0].arn : null
}
