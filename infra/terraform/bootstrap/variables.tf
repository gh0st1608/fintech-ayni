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

# Los dos IDs viajan en el sub del token OIDC desde julio de 2026 (github-oidc.tf). Son inmutables:
# solo cambian si se recrea la cuenta o el repositorio.
variable "github_owner_id" {
  description = "ID numérico del dueño del repositorio, tal como aparece en el sub del token OIDC."
  type        = string
  default     = "64746806"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_owner_id))
    error_message = "github_owner_id son solo dígitos."
  }
}

variable "github_repository_id" {
  description = "ID numérico del repositorio, tal como aparece en el sub del token OIDC."
  type        = string
  default     = "1433646405"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "github_repository_id son solo dígitos."
  }
}

variable "deploy_environment" {
  description = "GitHub Environment protegido (con aprobación) que puede asumir el rol de apply."
  type        = string
  default     = "prd"
}
