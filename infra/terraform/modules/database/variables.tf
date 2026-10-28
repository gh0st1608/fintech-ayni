variable "name" {
  description = "Identificador de la instancia (p. ej. ayni-prd)."
  type        = string
}

variable "vpc_id" {
  description = "VPC donde vive la base de datos."
  type        = string
}

variable "subnet_ids" {
  description = "Subredes privadas, en al menos dos zonas."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "RDS exige subredes en al menos dos zonas."
  }
}

variable "allowed_security_groups" {
  description = "Security groups que pueden conectarse, por un nombre fijo (p. ej. { api = sg-… }). Las claves tienen que conocerse antes del apply."
  type        = map(string)
  default     = {}
}

variable "engine_version" {
  description = "Versión mayor de PostgreSQL. Las versiones menores se actualizan solas en la ventana de mantenimiento."
  type        = string
  default     = "17"
}

variable "instance_class" {
  description = "Clase de instancia."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Almacenamiento inicial en GB (gp3)."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Tope del autoescalado de almacenamiento en GB. Igual a allocated_storage lo desactiva."
  type        = number
  default     = 100
}

variable "database_name" {
  description = "Base de datos inicial."
  type        = string
  default     = "ayni"
}

variable "master_username" {
  description = "Usuario administrador. La API usa uno propio con permisos mínimos, creado por las migraciones."
  type        = string
  default     = "ayni_admin"
}

variable "multi_az" {
  description = "Réplica en espera en otra zona."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Días de backups automáticos."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 35
    error_message = "Entre 1 y 35 días."
  }
}

variable "deletion_protection" {
  description = "Impide borrar la instancia hasta desactivarlo."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Borrar sin snapshot final. Solo en ambientes descartables."
  type        = bool
  default     = false
}

variable "performance_insights_enabled" {
  description = "Performance Insights (7 días gratis)."
  type        = bool
  default     = false
}

variable "monitoring_interval" {
  description = "Segundos entre métricas de Enhanced Monitoring. 0 lo desactiva."
  type        = number
  default     = 0

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Valores permitidos: 0, 1, 5, 10, 15, 30, 60."
  }
}

variable "log_retention_days" {
  description = "Retención de los logs de PostgreSQL en CloudWatch."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
