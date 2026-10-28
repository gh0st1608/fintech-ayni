variable "region" {
  description = "Región emulada."
  type        = string
  default     = "us-east-1"
}

variable "emulator_endpoint" {
  description = "Endpoint de floci."
  type        = string
  default     = "http://localhost:4566"

  validation {
    condition     = can(regex("^http://(localhost|127\\.0\\.0\\.1|floci)(:[0-9]+)?/?$", var.emulator_endpoint))
    error_message = "dev solo puede apuntar al emulador local, nunca a AWS."
  }
}

variable "image_tag" {
  description = "Etiqueta de la imagen de la API publicada en el ECR del emulador."
  type        = string
  default     = "local"
}

variable "app_config" {
  description = "Configuración no secreta de la API (variables de entorno). Ver apps/backend/.env.example."
  type        = map(string)
}

variable "observability_enabled" {
  description = "Crea las alarmas de respaldo en el emulador (sirve para probar el módulo; no notifican a nadie)."
  type        = bool
  default     = true
}

variable "new_relic" {
  description = "Cuenta de New Relic de dev. enabled = true envía la telemetría de la API y crea alertas, SLO y dashboard en esa cuenta."
  type = object({
    enabled    = bool
    account_id = number
    region     = optional(string, "US")
  })
  default = { enabled = false, account_id = 0 }

  validation {
    condition     = !var.new_relic.enabled || var.new_relic.account_id > 0
    error_message = "Con New Relic activo, definir account_id."
  }

  validation {
    condition     = contains(["US", "EU"], var.new_relic.region)
    error_message = "Valores permitidos: US, EU."
  }
}

variable "alert_emails" {
  description = "Correos que reciben los issues de New Relic de dev."
  type        = list(string)
  default     = []
}

variable "slo" {
  description = "SLO en New Relic. Activar cuando la API de dev ya reportó a la cuenta."
  type = object({
    enabled = bool
  })
  default = { enabled = false }
}

variable "new_relic_api_key" {
  description = "User API key de New Relic (TF_VAR_new_relic_api_key, desde el secreto NEW_RELIC_API_KEY). Efímera: no queda en el estado ni en el plan."
  type        = string
  default     = null
  sensitive   = true
  ephemeral   = true
}
