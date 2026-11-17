# CSP estricta: ni scripts ni estilos en línea. El build de Vite no genera ninguno (se comprueba
# en dist/index.html), así que no hacen falta 'unsafe-inline' ni nonces.
locals {
  content_security_policy = join("; ", [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src ${join(" ", concat(["'self'"], var.connect_src))}",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    # Doble cerrojo contra el clickjacking, con X-Frame-Options para navegadores viejos.
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ])
}

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = var.name
  description                       = "Acceso de ${var.name} al bucket del sitio"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "this" {
  name    = var.name
  comment = "Cabeceras de seguridad de ${var.domain_name}"

  security_headers_config {
    content_security_policy {
      content_security_policy = local.content_security_policy
      override                = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }

  # El back-office no usa cámara, micrófono ni ubicación: se niegan en bloque.
  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
      override = true
    }
  }
}

# Política administrada CachingOptimized: respeta el Cache-Control de cada archivo. El despliegue
# sube los assets con hash como inmutables y index.html como no-cache (runbook).
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "this" {
  # Excepciones acotadas a este módulo, en vez de apagarlas para todo el repositorio.
  #checkov:skip=CKV_AWS_68:Sin WAF por decisión BO8 (COPAYNI-74). El hueco está hecho: var.web_acl_arn lo enchufa sin tocar código.
  #checkov:skip=CKV2_AWS_47:La regla de Log4j vive en el WAF, que aquí no hay. Un sitio estático no interpreta cabeceras.
  #checkov:skip=CKV_AWS_86:Logs de acceso pendientes del bucket de logs común, igual que el ALB. Lo que hace el personal queda en staff_audit_log.
  #checkov:skip=CKV_AWS_310:Sin origen de respaldo: el origen es S3, con la durabilidad de S3. Un segundo origen sería otra copia del mismo sitio.
  #checkov:skip=CKV_AWS_374:Sin restricción geográfica por la misma decisión BO8: filtrar por país no es una barrera (se salta con una VPN) y sí deja fuera a quien viaja. La puerta es el login con MFA, y el contenido servido aquí es la aplicación, no los datos.
  enabled             = true
  comment             = var.domain_name
  aliases             = [var.domain_name]
  default_root_object = "index.html"
  price_class         = var.price_class
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  web_acl_id          = var.web_acl_arn
  tags                = var.tags

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id           = "s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.this.id
  }

  # Enrutado del lado del cliente: cualquier ruta que no sea un archivo devuelve index.html y el
  # router decide. 403 porque con Origin Access Control S3 niega en vez de responder 404.
  dynamic "custom_error_response" {
    for_each = toset([403, 404])

    content {
      error_code            = custom_error_response.value
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.this.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
