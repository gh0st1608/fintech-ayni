output "trail_arn" {
  description = "ARN del trail."
  value       = aws_cloudtrail.this.arn
}

output "bucket_name" {
  description = "Bucket con la copia íntegra de los eventos."
  value       = aws_s3_bucket.this.id
}

output "log_group_name" {
  description = "Grupo de CloudWatch Logs con los eventos (para reenviarlos a New Relic)."
  value       = aws_cloudwatch_log_group.this.name
}

output "security_topic_arn" {
  description = "Tópico de las alarmas de seguridad (null si están desactivadas)."
  value       = var.security_alarms_enabled ? local.topic_arn : null
}
