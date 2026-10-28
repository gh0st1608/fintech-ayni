variable "aws_account_id" {
  description = "Cuenta AWS dedicada de prd (ADR, D2)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000"
    error_message = "Definir el ID real de la cuenta dedicada (12 dígitos) en terraform.tfvars."
  }
}

variable "region" {
  description = "Región principal (ADR, D1). El trail cubre todas las regiones."
  type        = string
  default     = "us-east-1"
}

variable "owner" {
  description = "Responsable (etiqueta Owner)."
  type        = string
}

variable "cost_center" {
  description = "Centro de costos (etiqueta CostCenter)."
  type        = string
}

variable "new_relic" {
  description = "Cuenta de New Relic de prd. enabled = false no crea nada en New Relic ni la integración de AWS."
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

variable "security_emails" {
  description = "Correos que reciben las alarmas de seguridad de CloudTrail."
  type        = list(string)
  default     = []
}

variable "new_relic_api_key" {
  description = "User API key de New Relic (TF_VAR_new_relic_api_key, desde el secreto NEW_RELIC_API_KEY). Efímera: no queda en el estado ni en el plan."
  type        = string
  default     = null
  sensitive   = true
  ephemeral   = true
}
