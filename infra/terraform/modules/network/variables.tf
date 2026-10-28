variable "name" {
  description = "Prefijo de los recursos (p. ej. ayni-prd)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.name))
    error_message = "Solo minúsculas, números y guiones; entre 2 y 31 caracteres."
  }
}

variable "cidr_block" {
  description = "Rango IPv4 de la VPC. Se divide en subredes /20 (públicas y privadas por zona)."
  type        = string

  validation {
    condition     = can(cidrhost(var.cidr_block, 0)) && tonumber(split("/", var.cidr_block)[1]) <= 16
    error_message = "Tiene que ser un CIDR válido de /16 o más grande (16 subredes /20)."
  }
}

variable "availability_zones" {
  description = "Zonas de disponibilidad. Cada una recibe una subred pública y una privada."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2 && length(var.availability_zones) <= 4
    error_message = "Entre 2 y 4 zonas: RDS y el ALB exigen al menos dos."
  }
}

variable "nat_gateway_mode" {
  description = "none: sin salida desde las subredes privadas. single: un NAT compartido. per_az: uno por zona."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "single", "per_az"], var.nat_gateway_mode)
    error_message = "Valores permitidos: none, single, per_az."
  }
}

variable "flow_logs_retention_days" {
  description = "Días de retención de los VPC Flow Logs (rechazos). null los desactiva."
  type        = number
  default     = null
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
