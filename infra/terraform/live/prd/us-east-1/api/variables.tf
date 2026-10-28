variable "aws_account_id" {
  description = "Cuenta AWS dedicada de prd (ADR, D2)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000"
    error_message = "Definir el ID real de la cuenta dedicada (12 dígitos) en terraform.tfvars."
  }
}

variable "region" {
  description = "Región de prd (ADR, D1)."
  type        = string
  default     = "us-east-1"
}

variable "owner" {
  description = "Responsable del stack (etiqueta Owner)."
  type        = string
}

variable "cost_center" {
  description = "Centro de costos (etiqueta CostCenter)."
  type        = string
}

variable "image_tag" {
  description = "SHA del commit de la imagen a desplegar. Lo pasa el pipeline."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{7,40}$", var.image_tag))
    error_message = "Usar el SHA del commit: las etiquetas del repositorio son inmutables."
  }
}

variable "api_domain_name" {
  description = "Dominio público de la API (ADR, D3)."
  type        = string
}

variable "app_config" {
  description = "Configuración no secreta de la API (variables de entorno). Ver apps/backend/.env.example."
  type        = map(string)
}

variable "new_relic" {
  description = "Cuenta de New Relic de prd. Debe coincidir con la del stack account."
  type = object({
    enabled    = bool
    account_id = number
    region     = optional(string, "US")
  })

  validation {
    condition     = !var.new_relic.enabled || var.new_relic.account_id > 0
    error_message = "Con New Relic activo, definir account_id."
  }

  validation {
    condition     = contains(["US", "EU"], var.new_relic.region)
    error_message = "Valores permitidos: US, EU."
  }
}

variable "slo" {
  description = "SLO en New Relic. Activar (enabled = true) después del primer despliegue, cuando la API ya reportó."
  type = object({
    enabled              = bool
    availability_target  = optional(number, 99.9)
    latency_target       = optional(number, 99)
    latency_threshold_ms = optional(number, 800)
  })
  default = { enabled = false }
}

variable "alert_emails" {
  description = "Correos que reciben las alarmas."
  type        = list(string)
  default     = []
}

variable "alarm_config" {
  description = "Umbrales de las alarmas de respaldo de CloudWatch. null: los valores iniciales del módulo."
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
  default = null
}

variable "new_relic_api_key" {
  description = "User API key de New Relic (TF_VAR_new_relic_api_key, desde el secreto NEW_RELIC_API_KEY). Efímera: no queda en el estado ni en el plan."
  type        = string
  default     = null
  sensitive   = true
  ephemeral   = true
}
