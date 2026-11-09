variable "name" {
  description = "Prefijo de los recursos (p. ej. ayni-prd)."
  type        = string
}

variable "email" {
  description = "Envío del OTP por email con SES. null: sin email. Con route53_zone_id se publican los registros DKIM; sin él, salen en dkim_records para cargarlos a mano."
  type = object({
    domain          = string
    from_address    = string
    route53_zone_id = optional(string)
  })
  default = null

  validation {
    condition     = var.email == null || endswith(trimsuffix(var.email.from_address, ">"), "@${var.email.domain}")
    error_message = "from_address debe ser del dominio verificado (email.domain)."
  }
}

variable "sms" {
  description = "Envío del OTP por SMS con End User Messaging SMS. null: sin SMS. La identidad de origen (número, pool o sender ID) se registra fuera de Terraform: depende del país y de su trámite."
  type = object({
    origination_identity_arn = string
  })
  default = null

  validation {
    condition     = var.sms == null || can(regex("^arn:aws[a-z-]*:sms-voice:[a-z0-9-]+:[0-9]{12}:(phone-number|pool|sender-id)/.+$", var.sms.origination_identity_arn))
    error_message = "origination_identity_arn debe ser el ARN de un número, pool o sender ID de End User Messaging SMS."
  }
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
