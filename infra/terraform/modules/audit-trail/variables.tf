variable "name" {
  description = "Prefijo de los recursos (p. ej. ayni-prd)."
  type        = string
}

variable "s3_retention_days" {
  description = "Días que se conservan los eventos en S3 (copia íntegra y validable)."
  type        = number
  default     = 365

  validation {
    condition     = var.s3_retention_days >= 90
    error_message = "Conservar al menos 90 días de auditoría."
  }
}

variable "cloudwatch_retention_days" {
  description = "Días de eventos en CloudWatch Logs, donde corren los filtros de seguridad."
  type        = number
  default     = 90
}

variable "data_event_bucket_names" {
  description = "Buckets cuyos accesos a objetos (lectura y escritura) se auditan: los documentos KYC."
  type        = list(string)
  default     = []
}

variable "security_alarms_enabled" {
  description = "Crea los filtros y alarmas de seguridad (recomendaciones CIS)."
  type        = bool
  default     = true
}

variable "trusted_role_names" {
  description = "Roles cuyos cambios de IAM y de security groups no alarman (p. ej. el rol de apply de Terraform: sus cambios pasan por un plan aprobado)."
  type        = list(string)
  default     = []
}

variable "notification_topic_arn" {
  description = "Tópico SNS para las alarmas de seguridad. null: el módulo crea uno."
  type        = string
  default     = null
}

variable "notification_emails" {
  description = "Correos suscritos al tópico creado por el módulo."
  type        = list(string)
  default     = []
}

variable "runbook_base_url" {
  description = "URL del runbook de seguridad; cada alarma enlaza a su sección."
  type        = string
}

variable "force_destroy" {
  description = "Permite destruir el bucket con eventos. Solo en ambientes descartables."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
