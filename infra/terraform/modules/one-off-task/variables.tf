variable "name" {
  description = "Nombre de la tarea (p. ej. ayni-prd-api-migrate). Prefijo de todos sus recursos."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,54}$", var.name))
    error_message = "Minúsculas, números y guiones."
  }
}

variable "image" {
  description = "Imagen completa del contenedor, con etiqueta inmutable (repositorio:sha)."
  type        = string
}

variable "command" {
  description = "Comando que ejecuta la tarea (p. ej. [\"node\", \"dist/migrate.js\"])."
  type        = list(string)
}

variable "cpu" {
  description = "Unidades de CPU de la tarea (256 = 0,25 vCPU)."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Memoria de la tarea en MiB."
  type        = number
  default     = 1024
}

variable "environment" {
  description = "Variables de entorno no secretas."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Variables de entorno secretas: nombre -> ARN de Secrets Manager o SSM. El rol de ejecución de esta tarea recibe permiso para leer exactamente esas."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for arn in values(var.secrets) : can(regex("^arn:aws[a-z-]*:(secretsmanager|ssm):", arn))])
    error_message = "Cada secreto se referencia por ARN de Secrets Manager o SSM."
  }
}

variable "task_role_arn" {
  description = "Rol de la aplicación durante la tarea. Sin valor, la tarea corre sin permisos de AWS: a las migraciones les basta con la base."
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "Retención del grupo de logs propio de la tarea."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
