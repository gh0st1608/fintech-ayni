variable "name" {
  description = "Nombre lógico del servicio."
  type        = string
}

variable "enabled" {
  description = "Activa la creación de alarmas y del tópico de notificaciones."
  type        = bool
  default     = true
}

variable "alarm_config" {
  description = "Umbrales y evaluación de las señales principales. Valores iniciales: se ajustan con la línea base real."
  nullable    = false
  type = object({
    latency_p95_ms        = number
    error_rate_percent    = number
    cpu_percent           = number
    memory_percent        = number
    db_cpu_percent        = number
    db_free_storage_gb    = number
    evaluation_periods    = number
    datapoints_to_alarm   = number
    period_seconds        = number
    min_requests_for_rate = number
  })
  default = {
    latency_p95_ms        = 800
    error_rate_percent    = 2
    cpu_percent           = 80
    memory_percent        = 85
    db_cpu_percent        = 80
    db_free_storage_gb    = 5
    evaluation_periods    = 3
    datapoints_to_alarm   = 2
    period_seconds        = 300
    min_requests_for_rate = 20
  }

  validation {
    condition     = var.alarm_config.datapoints_to_alarm <= var.alarm_config.evaluation_periods
    error_message = "datapoints_to_alarm no puede superar evaluation_periods."
  }
}

variable "alarm_names" {
  description = "Alarmas a crear. null: todas. Con New Relic como lugar principal, CloudWatch queda de respaldo con unas pocas (p. ej. [\"api-unhealthy-targets\", \"db-storage-low\"])."
  type        = list(string)
  default     = null

  validation {
    condition = var.alarm_names == null || alltrue([
      for alarm in coalesce(var.alarm_names, []) : contains([
        "api-cpu-high", "api-memory-high", "api-unhealthy-targets", "api-latency-p95", # gitleaks:allow (nombres de alarmas, no claves)
        "api-error-rate", "db-cpu-high", "db-storage-low",
      ], alarm)
    ])
    error_message = "Alarmas disponibles: api-cpu-high, api-memory-high, api-unhealthy-targets, api-latency-p95, api-error-rate, db-cpu-high, db-storage-low."
  }
}

variable "ecs" {
  description = "Servicio ECS que se vigila."
  type = object({
    cluster_name = string
    service_name = string
  })
}

variable "alb" {
  description = "Balanceador y target group (sufijos de ARN, dimensiones de CloudWatch)."
  type = object({
    arn_suffix              = string
    target_group_arn_suffix = string
  })
}

variable "db_instance_identifier" {
  description = "Instancia RDS. null: sin alarmas de base de datos."
  type        = string
  default     = null
}

variable "notification_topic_arn" {
  description = "Tópico SNS existente. null: el módulo crea uno. No almacenar credenciales aquí."
  type        = string
  default     = null
}

variable "notification_emails" {
  description = "Correos suscritos al tópico creado por el módulo (cada uno confirma la suscripción)."
  type        = list(string)
  default     = []
}

variable "runbook_base_url" {
  description = "URL del runbook; cada alarma enlaza a su sección (#nombre-de-la-alarma)."
  type        = string
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
