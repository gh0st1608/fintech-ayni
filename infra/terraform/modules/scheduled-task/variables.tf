variable "name" {
  description = "Nombre del job (p. ej. ayni-prd-circle-cycle). Prefijo de todos sus recursos."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,50}$", var.name))
    error_message = "Solo minúsculas, números y guiones; hasta 51 caracteres."
  }
}

variable "enabled" {
  description = "Estado del schedule. false lo crea deshabilitado: no lanza tareas."
  type        = bool
  default     = true
}

variable "schedule_expression" {
  description = "Cuándo corre: cron(...) o rate(...) de EventBridge Scheduler."
  type        = string

  validation {
    condition     = can(regex("^(cron|rate)\\(.+\\)$", var.schedule_expression))
    error_message = "Tiene que ser una expresión cron(...) o rate(...)."
  }
}

variable "schedule_timezone" {
  description = "Zona horaria de la expresión (IANA)."
  type        = string
  default     = "UTC"
}

variable "maximum_retry_attempts" {
  description = "Reintentos del scheduler si no puede lanzar la tarea. El job tiene que ser idempotente."
  type        = number
  default     = 2
}

variable "cluster_arn" {
  description = "Cluster ECS donde corre la tarea."
  type        = string
}

variable "image" {
  description = "Imagen completa del contenedor, con etiqueta inmutable (repositorio:sha)."
  type        = string
}

variable "command" {
  description = "Comando del job (p. ej. [\"node\", \"dist/jobs/circle-cycle.js\"])."
  type        = list(string)
}

variable "cpu" {
  description = "Unidades de CPU de la tarea (256 = 0,25 vCPU)."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Memoria de la tarea en MiB."
  type        = number
  default     = 512
}

variable "environment" {
  description = "Variables de entorno no secretas."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Variables de entorno secretas: nombre -> ARN. El rol de ejecución ya tiene que poder leerlas."
  type        = map(string)
  default     = {}
}

variable "execution_role_arn" {
  description = "Rol de ejecución de ECS (el del servicio)."
  type        = string
}

variable "task_role_arn" {
  description = "Rol de la aplicación (el del servicio)."
  type        = string
}

variable "log_group_name" {
  description = "Grupo de logs de la tarea."
  type        = string
}

variable "subnet_ids" {
  description = "Subredes de la tarea."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups de la tarea."
  type        = list(string)
}

variable "assign_public_ip" {
  description = "IP pública en la tarea. Necesario en subredes públicas sin NAT."
  type        = bool
  default     = false
}

variable "alarm_enabled" {
  description = "Crea la alarma de fallas. Requiere alarm_topic_arn."
  type        = bool
  default     = false
}

variable "alarm_topic_arn" {
  description = "Tópico SNS que recibe la alarma de fallas."
  type        = string
  default     = null
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
