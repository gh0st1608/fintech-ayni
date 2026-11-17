mock_provider "aws" {}

variables {
  name        = "ayni-prd-backoffice"
  bucket_name = "ayni-prd-backoffice-000000000000"
  domain_name = "backoffice.example.com"
  connect_src = ["https://backend-ayni.example.com", "https://identitycenter.amazonaws.com"]
  route53     = { zone_id = "Z123" }
}

run "cabeceras_de_seguridad" {
  command = plan

  assert {
    condition = alltrue([
      for origen in var.connect_src : strcontains(local.content_security_policy, origen)
    ])
    error_message = "La CSP debe dejar llamar a la API y al proveedor de identidad; si no, el sitio no puede trabajar."
  }

  assert {
    condition = alltrue([
      strcontains(local.content_security_policy, "default-src 'none'"),
      strcontains(local.content_security_policy, "frame-ancestors 'none'"),
      !strcontains(local.content_security_policy, "unsafe-inline"),
      !strcontains(local.content_security_policy, "unsafe-eval"),
    ])
    error_message = "CSP estricta: nada en línea y nada embebible."
  }

  assert {
    condition     = one(aws_cloudfront_response_headers_policy.this.security_headers_config[*].frame_options[0].frame_option) == "DENY"
    error_message = "X-Frame-Options: DENY, como pide COPAYNI-74."
  }

  assert {
    condition     = one(aws_cloudfront_response_headers_policy.this.security_headers_config[*].strict_transport_security[0].access_control_max_age_sec) == 63072000
    error_message = "HSTS de dos años: el back-office solo se sirve por HTTPS."
  }
}

run "rutas_del_router_y_tls" {
  command = plan

  assert {
    condition = alltrue([
      for respuesta in aws_cloudfront_distribution.this.custom_error_response :
      respuesta.response_code == 200 && respuesta.response_page_path == "/index.html"
    ])
    error_message = "Una ruta profunda debe devolver index.html con 200: el enrutado es del cliente."
  }

  assert {
    condition     = toset([for respuesta in aws_cloudfront_distribution.this.custom_error_response : respuesta.error_code]) == toset([403, 404])
    error_message = "Con Origin Access Control S3 niega (403) en vez de responder 404: hay que cubrir los dos."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.viewer_certificate[*].minimum_protocol_version) == "TLSv1.2_2021"
    error_message = "TLS 1.2 como mínimo."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.default_cache_behavior[*].viewer_protocol_policy) == "redirect-to-https"
    error_message = "HTTP redirige a HTTPS."
  }
}

run "el_bucket_no_se_expone" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.this.block_public_acls,
      aws_s3_bucket_public_access_block.this.block_public_policy,
      aws_s3_bucket_public_access_block.this.ignore_public_acls,
      aws_s3_bucket_public_access_block.this.restrict_public_buckets,
    ])
    error_message = "Al bucket se llega solo por CloudFront."
  }

  assert {
    condition     = length(aws_cloudfront_origin_access_control.this.signing_protocol) > 0 && aws_cloudfront_origin_access_control.this.signing_behavior == "always"
    error_message = "CloudFront firma siempre su petición al origen."
  }
}

run "dns_en_route53" {
  command = plan

  assert {
    condition     = toset(keys(aws_route53_record.site)) == toset(["A", "AAAA"])
    error_message = "El dominio apunta a la distribución por IPv4 e IPv6."
  }

  assert {
    condition     = length(aws_route53_record.validation) == 1
    error_message = "Validación del certificado por DNS: se renueva solo."
  }
}

run "dns_externo" {
  command = plan

  variables {
    route53 = null
  }

  assert {
    condition     = length(aws_route53_record.site) == 0 && length(aws_route53_record.validation) == 0
    error_message = "Con DNS externo, los registros se crean a mano."
  }
}
