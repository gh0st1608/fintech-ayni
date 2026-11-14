variable "aws_account_id" {
  description = "Cuenta AWS dedicada de prd (ADR, D2)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000"
    error_message = "Definir el ID real de la cuenta dedicada (12 dígitos) en terraform.tfvars."
  }
}

variable "region" {
  description = "Región de la instancia de Identity Center y de la API."
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

variable "backoffice_url" {
  description = "URL base del back-office (p. ej. https://backoffice.ayni.pe). Se usa como redirect URI OIDC."
  type        = string
}
