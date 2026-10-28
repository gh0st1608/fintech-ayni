variable "name" {
  description = "Nombre del servicio (p. ej. ayni-prd-api). Prefijo de todos sus recursos."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,27}$", var.name))
    error_message = "Solo minúsculas, números y guiones; hasta 28 caracteres (límite de nombres del ALB)."
  }
}

variable "vpc_id" {
  description = "VPC del servicio."
  type        = string
}

variable "alb_subnet_ids" {
  description = "Subredes públicas del balanceador."
  type        = list(string)
}

variable "service_subnet_ids" {
  description = "Subredes de las tareas: privadas si hay NAT, públicas si no."
  type        = list(string)
}

variable "assign_public_ip" {
  description = "IP pública en las tareas. Necesario en subredes públicas sin NAT para llegar a ECR, Secrets Manager y New Relic."
  type        = bool
  default     = false
}

variable "image" {
  description = "Imagen completa del contenedor, con etiqueta inmutable (repositorio:sha)."
  type        = string
}

variable "container_port" {
  description = "Puerto de la API dentro del contenedor (PORT)."
  type        = number
  default     = 3000
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

variable "desired_count" {
  description = "Tareas al crear el servicio. Con autoescalado, lo ajusta el autoescalado."
  type        = number
  default     = 1
}

variable "autoscaling" {
  description = "Autoescalado por CPU. null lo desactiva."
  type = object({
    min_capacity       = number
    max_capacity       = number
    cpu_target_percent = number
  })
  default = null

  validation {
    condition     = var.autoscaling == null || try(var.autoscaling.min_capacity <= var.autoscaling.max_capacity, false)
    error_message = "min_capacity no puede superar max_capacity."
  }
}

variable "environment" {
  description = "Variables de entorno no secretas."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Variables de entorno secretas: nombre -> ARN de Secrets Manager (admite el sufijo :clave::) o de un parámetro SSM."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for arn in values(var.secrets) : can(regex("^arn:aws[a-z-]*:(secretsmanager|ssm):", arn))])
    error_message = "Cada secreto tiene que ser un ARN de Secrets Manager o de SSM Parameter Store."
  }
}

variable "task_policies" {
  description = "Permisos de la aplicación: nombre fijo -> política JSON (p. ej. { documents = … })."
  type        = map(string)
  default     = {}
}

variable "health_check_path" {
  description = "Ruta que comprueba el ALB. /health/live: una caída de la base de datos no reemplaza las tareas (ADR)."
  type        = string
  default     = "/health/live"
}

# Objetos y no ARN sueltos: que el objeto exista se sabe en el plan aunque el ARN se conozca
# recién en el apply (certificado y WAF creados en el mismo stack).
variable "https" {
  description = "HTTPS en 443 con redirección desde 80. null: solo HTTP (dev local)."
  type = object({
    certificate_arn = string
    ssl_policy      = optional(string, "ELBSecurityPolicy-TLS13-1-2-2021-06")
  })
  default = null
}

variable "ingress_cidr_blocks" {
  description = "Orígenes que pueden llegar al balanceador."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "waf" {
  description = "Web ACL de WAF asociada al balanceador. null: sin WAF."
  type = object({
    web_acl_arn = string
  })
  default = null
}

variable "deregistration_delay" {
  description = "Segundos que el ALB espera para quitar una tarea. Deja terminar las peticiones en curso (ADR)."
  type        = number
  default     = 15
}

variable "stop_timeout" {
  description = "Segundos entre SIGTERM y SIGKILL: margen para cerrar y vaciar la telemetría (máximo 5 s en la API)."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "Retención de los logs del contenedor."
  type        = number
  default     = 30
}

variable "alb_deletion_protection" {
  description = "Impide borrar el balanceador."
  type        = bool
  default     = true
}

variable "container_insights" {
  description = "Métricas de Container Insights (tienen costo)."
  type        = bool
  default     = false
}

variable "wait_for_steady_state" {
  description = "terraform apply espera a que el despliegue termine (o falle y vuelva atrás)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
