variable "aws_account_id" {
  description = "Cuenta AWS dedicada de prd (ADR, D2)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000"
    error_message = "Definir el ID real de la cuenta dedicada (12 dígitos) en terraform.tfvars."
  }
}

variable "region" {
  description = "Región del bucket del estado."
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

variable "github_repository" {
  description = "Repositorio que puede asumir los roles (owner/nombre)."
  type        = string
  default     = "gh0st1608/fintech-ayni"
}

variable "deploy_environment" {
  description = "GitHub Environment protegido (con aprobación) que puede asumir el rol de apply."
  type        = string
  default     = "prd"
}
