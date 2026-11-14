variable "account_id" {
  description = "Cuenta AWS a la que dan acceso los grupos."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "El ID de cuenta tiene 12 dígitos."
  }
}

variable "name_prefix" {
  description = "Prefijo de los grupos y permission sets (p. ej. ayni-prd)."
  type        = string
}

variable "accesses" {
  description = <<-EOT
    Accesos por función: la clave es el sufijo del grupo y del permission set. Cada uno lleva políticas
    administradas de AWS, una política inline opcional (JSON) y la duración de la sesión (ISO 8601).
  EOT
  type = map(object({
    description         = string
    managed_policy_arns = optional(list(string), [])
    inline_policy       = optional(string)
    session_duration    = optional(string, "PT4H")
  }))

  validation {
    condition = alltrue([
      for access in values(var.accesses) :
      length(access.managed_policy_arns) > 0 || access.inline_policy != null
    ])
    error_message = "Cada acceso necesita al menos una política administrada o una inline."
  }

  validation {
    condition = alltrue([
      for access in values(var.accesses) : can(regex("^PT([1-9]|1[0-2])H$", access.session_duration))
    ])
    error_message = "La sesión dura entre PT1H y PT12H."
  }

  validation {
    condition     = alltrue([for key in keys(var.accesses) : can(regex("^[a-z][a-z0-9-]{1,20}$", key))])
    error_message = "Las claves son minúsculas, números y guiones (2 a 21 caracteres)."
  }
}

variable "tags" {
  description = "Etiquetas adicionales de los permission sets."
  type        = map(string)
  default     = {}
}
