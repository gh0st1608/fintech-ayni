variable "name" {
  description = "Prefijo de los recursos (p. ej. ayni-prd). Los roles se llaman <name>-newrelic-*."
  type        = string
}

variable "newrelic_account_id" {
  description = "ID de la cuenta de New Relic que recibe los datos."
  type        = number
}

variable "newrelic_region" {
  description = "Región de la cuenta de New Relic."
  type        = string
  default     = "US"

  validation {
    condition     = contains(["US", "EU"], var.newrelic_region)
    error_message = "Valores permitidos: US, EU."
  }
}

variable "license_key_secret_arn" {
  description = "Secreto con la license key de ingesta en formato {\"api_key\": \"…\"}. Firehose la lee de ahí: nunca pasa por el estado."
  type        = string
}

variable "metric_namespaces" {
  description = "Namespaces de CloudWatch que se envían a New Relic."
  type        = list(string)
  default     = ["AWS/ECS", "AWS/ApplicationELB", "AWS/RDS", "AWS/WAFV2", "AWS/NATGateway", "AWS/Firehose"]
}

variable "logs_enabled" {
  description = "Crea el Firehose de logs (los grupos se suscriben con el módulo log-forwarding)."
  type        = bool
  default     = true
}

variable "failed_delivery_retention_days" {
  description = "Días que se conservan en S3 los envíos que New Relic rechazó."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
