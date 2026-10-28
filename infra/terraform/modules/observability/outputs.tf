output "notification_topic_arn" {
  description = "Tópico que recibe las alarmas (null si el módulo está desactivado)."
  value       = var.enabled ? local.topic_arn : null
}

output "alarm_arns" {
  description = "ARN de cada alarma, por nombre."
  value = merge(
    { for key, alarm in aws_cloudwatch_metric_alarm.simple : key => alarm.arn },
    { for alarm in aws_cloudwatch_metric_alarm.latency_p95 : "api-latency-p95" => alarm.arn },
    { for alarm in aws_cloudwatch_metric_alarm.error_rate : "api-error-rate" => alarm.arn },
  )
}
