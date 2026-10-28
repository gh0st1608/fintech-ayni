variable "domain_name" {
  description = "Dominio público de la API (p. ej. backend-ayni.solutionserj.com)."
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

variable "alb_dns_name" {
  description = "DNS del balanceador. Solo se usa con route53."
  type        = string
  default     = null
}

variable "alb_zone_id" {
  description = "Hosted zone del balanceador. Solo se usa con route53."
  type        = string
  default     = null
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}

locals {
  managed_dns = var.route53 != null
}

resource "aws_acm_certificate" "this" {
  domain_name       = var.domain_name
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Indexado por el dominio (conocido en el plan), no por las opciones que devuelve ACM al crear.
resource "aws_route53_record" "validation" {
  for_each = local.managed_dns ? toset([var.domain_name]) : toset([])

  zone_id         = var.route53.zone_id
  name            = one([for option in aws_acm_certificate.this.domain_validation_options : option.resource_record_name if option.domain_name == each.key])
  type            = one([for option in aws_acm_certificate.this.domain_validation_options : option.resource_record_type if option.domain_name == each.key])
  records         = [one([for option in aws_acm_certificate.this.domain_validation_options : option.resource_record_value if option.domain_name == each.key])]
  ttl             = 300
  allow_overwrite = true
}

# Espera a que ACM emita el certificado. Con DNS externo, el registro de validación se crea a mano
# mientras este recurso espera (README, "Dominio con DNS externo").
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = local.managed_dns ? [for record in aws_route53_record.validation : record.fqdn] : null

  timeouts {
    create = "60m"
  }
}

resource "aws_route53_record" "api" {
  count = local.managed_dns ? 1 : 0

  zone_id = var.route53.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }

  lifecycle {
    precondition {
      condition     = var.alb_dns_name != null && var.alb_zone_id != null
      error_message = "Con route53 hay que pasar alb_dns_name y alb_zone_id."
    }
  }
}

output "certificate_arn" {
  description = "Certificado validado, para el listener HTTPS."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "validation_records" {
  description = "Registros CNAME que validan el certificado. Con DNS externo, se crean en el proveedor del dominio."
  value = [
    for option in aws_acm_certificate.this.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}
