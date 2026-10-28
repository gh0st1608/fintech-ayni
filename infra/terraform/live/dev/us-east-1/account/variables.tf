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

variable "new_relic_enabled" {
  description = "Crea en floci el secreto de la license key de New Relic que usa la API de dev."
  type        = bool
  default     = false
}
