# CloudFront solo acepta certificados de us-east-1. El stack ya vive en esa región; con otra,
# hay que pasarle al módulo un provider alias de us-east-1.
resource "aws_acm_certificate" "this" {
  domain_name       = var.domain_name
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  managed_dns = var.route53 != null
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
# mientras este recurso espera.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = local.managed_dns ? [for record in aws_route53_record.validation : record.fqdn] : null

  timeouts {
    create = "60m"
  }
}

resource "aws_route53_record" "site" {
  for_each = local.managed_dns ? toset(["A", "AAAA"]) : toset([])

  zone_id = var.route53.zone_id
  name    = var.domain_name
  type    = each.key

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
