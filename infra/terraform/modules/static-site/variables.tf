variable "name" {
  description = "Nombre base de los recursos (p. ej. ayni-prd-backoffice)."
  type        = string
}

variable "bucket_name" {
  description = "Nombre global del bucket que guarda los archivos del sitio."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "Nombre de bucket S3 inválido."
  }
}

variable "domain_name" {
  description = "Dominio público del sitio (p. ej. admin.backend-ayni.solutionserj.com)."
  type        = string
}

# Objeto y no un ID suelto: que exista se sabe en el plan aunque la zona se cree en el mismo stack.
variable "route53" {
  description = "Hosted zone de Route 53 del dominio. null: el DNS es externo y los registros se crean a mano."
  type = object({
    zone_id = string
  })
  default = null
}

variable "connect_src" {
  description = "Orígenes a los que el sitio puede llamar, además de sí mismo: la API y el proveedor de identidad. Entran en connect-src de la CSP."
  type        = list(string)
  default     = []
}

variable "web_acl_arn" {
  description = "Web ACL de WAF de alcance CLOUDFRONT. null: sin WAF (BO8 se decidió sin filtro de red; la puerta es el login corporativo)."
  type        = string
  default     = null
}

variable "price_class" {
  description = "Regiones de borde de CloudFront. PriceClass_100 cubre América y Europa, que es donde opera el personal."
  type        = string
  default     = "PriceClass_100"
}

variable "force_destroy" {
  description = "Permite destruir el bucket con objetos. Solo en ambientes descartables."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}
