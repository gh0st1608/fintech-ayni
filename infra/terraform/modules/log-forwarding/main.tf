variable "name" {
  description = "Prefijo de los filtros de suscripción."
  type        = string
}

variable "log_groups" {
  description = "Grupos de logs a reenviar, por un nombre fijo (p. ej. { waf = \"aws-waf-logs-…\" }). Las claves tienen que conocerse antes del apply."
  type        = map(string)
}

variable "destination_arn" {
  description = "Firehose de destino (el de logs de newrelic-aws-integration)."
  type        = string
}

variable "role_arn" {
  description = "Rol que CloudWatch Logs asume para escribir en el Firehose."
  type        = string
}

variable "filter_pattern" {
  description = "Patrón de filtro. Vacío: todos los eventos."
  type        = string
  default     = ""
}

# Cada grupo de logs admite hasta dos filtros de suscripción; este ocupa uno.
resource "aws_cloudwatch_log_subscription_filter" "this" {
  for_each = var.log_groups

  name            = "${var.name}-${each.key}"
  log_group_name  = each.value
  destination_arn = var.destination_arn
  role_arn        = var.role_arn
  filter_pattern  = var.filter_pattern
  distribution    = "ByLogStream"
}

output "subscription_names" {
  description = "Filtros de suscripción creados, por clave."
  value       = { for key, filter in aws_cloudwatch_log_subscription_filter.this : key => filter.name }
}
