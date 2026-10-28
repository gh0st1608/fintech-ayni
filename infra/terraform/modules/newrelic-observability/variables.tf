variable "name" {
  description = "Nombre lógico (p. ej. ayni-prd-api): prefijo de la política, el dashboard y el monitor."
  type        = string
}

variable "enabled" {
  description = "Crea los recursos en New Relic."
  type        = bool
  default     = true
}

variable "account_id" {
  description = "Cuenta de New Relic."
  type        = number
}

variable "service_name" {
  description = "service.name que reporta la API por OpenTelemetry (APP_NAME)."
  type        = string
}

variable "environment" {
  description = "deployment.environment.name que reporta la API (DEPLOYMENT_ENVIRONMENT)."
  type        = string
}

variable "notification_emails" {
  description = "Correos que reciben los issues de la política. Vacío: sin destino (solo se ven en New Relic)."
  type        = list(string)
  default     = []
}

variable "alert_config" {
  description = "Umbrales de las condiciones de la API. Iniciales: se ajustan con la línea base real."
  nullable    = false
  type = object({
    error_rate_percent = number
    latency_p95_ms     = number
    duration_minutes   = number
  })
  default = {
    error_rate_percent = 2
    latency_p95_ms     = 800
    duration_minutes   = 10
  }
}

variable "slo" {
  description = "SLO de disponibilidad y latencia. Activar cuando la API ya reportó a la cuenta: el SLO se asocia a la entidad del servicio."
  nullable    = false
  type = object({
    enabled                 = bool
    availability_target     = optional(number, 99.9)
    latency_target          = optional(number, 99)
    latency_threshold_ms    = optional(number, 800)
    rolling_window_days     = optional(number, 28)
    fast_burn_rate_multiple = optional(number, 14.4)
  })
  default = { enabled = false }

  validation {
    condition     = contains([1, 7, 28], var.slo.rolling_window_days)
    error_message = "New Relic admite ventanas de 1, 7 o 28 días."
  }
}

variable "synthetics" {
  description = "Monitor externo del health check. null: sin monitor (p. ej. dev, que no es accesible desde internet)."
  type = object({
    url       = string
    period    = optional(string, "EVERY_5_MINUTES")
    locations = optional(list(string), ["AWS_US_EAST_1", "AWS_SA_EAST_1"])
  })
  default = null
}

variable "aws_infra" {
  description = "Recursos AWS cuyas métricas llegan por metric streams. null: sin condiciones ni página de infraestructura."
  type = object({
    ecs_cluster_name       = string
    ecs_service_name       = string
    alb_arn_suffix         = string
    db_instance_identifier = string
    cpu_percent            = optional(number, 80)
    memory_percent         = optional(number, 85)
    db_cpu_percent         = optional(number, 80)
    db_free_storage_gb     = optional(number, 5)
    duration_minutes       = optional(number, 15)
  })
  default = null
}

variable "runbook_base_url" {
  description = "URL del runbook; cada condición enlaza a su sección."
  type        = string
}
