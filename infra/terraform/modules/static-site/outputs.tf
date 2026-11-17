output "bucket_name" {
  description = "Bucket donde el despliegue sube los archivos del sitio."
  value       = aws_s3_bucket.this.bucket
}

output "distribution_id" {
  description = "Distribución de CloudFront, para invalidar la caché después de desplegar."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "Dominio de CloudFront, por si hay que entrar sin el nombre propio."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "url" {
  description = "Dirección pública del sitio."
  value       = "https://${var.domain_name}"
}

output "content_security_policy" {
  description = "CSP que devuelve CloudFront; el stack la comprueba en sus pruebas."
  value       = local.content_security_policy
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
