# Módulo `static-site`

Sitio estático publicado con CloudFront sobre un bucket privado: S3 sin acceso público, Origin Access Control, certificado de ACM validado por DNS, CSP estricta y las rutas del router devueltas como `index.html`.

Hecho para el back-office (COPAYNI-74), pero no sabe nada de él: sirve cualquier SPA compilada.

## Ejemplo

```hcl
module "backoffice" {
  source = "../../../../modules/static-site"

  name        = "ayni-prd-backoffice"
  bucket_name = "ayni-prd-backoffice-${var.aws_account_id}"
  domain_name = "admin.backend-ayni.solutionserj.com"
  route53     = { zone_id = aws_route53_zone.api.zone_id }

  # La API y el proveedor de identidad: sin esto la CSP corta las llamadas del sitio.
  connect_src = [
    "https://backend-ayni.solutionserj.com",
    "https://identitycenter.amazonaws.com",
  ]
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre base de los recursos. |
| `bucket_name` | **sí** | Nombre global del bucket del sitio. |
| `domain_name` | **sí** | Dominio público. Su certificado se emite en la región del stack, que para CloudFront debe ser `us-east-1`. |
| `route53` | no | Hosted zone del dominio. `null`: DNS externo, los registros se crean a mano. |
| `connect_src` | no | Orígenes a los que el sitio puede llamar, además de sí mismo. |
| `web_acl_arn` | no | Web ACL de alcance `CLOUDFRONT`. `null`: sin WAF. |
| `price_class` | no | Regiones de borde. Por defecto `PriceClass_100`. |
| `force_destroy` | no | Permite destruir el bucket con objetos. Solo en ambientes descartables. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `bucket_name` | Bucket al que sube el despliegue. |
| `distribution_id` | Distribución, para invalidar la caché. |
| `distribution_domain_name` | Dominio de CloudFront. |
| `url` | Dirección pública del sitio. |
| `content_security_policy` | La CSP que se devuelve, para afirmarla en las pruebas del stack. |
| `validation_records` | CNAME de validación del certificado, para el DNS externo. |

## Decisiones

- **CSP estricta, sin `unsafe-inline`.** El build de Vite no emite scripts ni estilos en línea (se comprueba en `dist/index.html`), así que no hacen falta nonces. Si alguna dependencia empieza a inyectar estilos, el navegador los bloqueará y habrá que decidir entre quitarla o firmar su hash: no se añade `unsafe-inline` por costumbre.
- **403 y 404 devuelven `index.html` con 200.** Con Origin Access Control, S3 responde 403 a lo que no existe, porque el rol no tiene `ListBucket`. Cubrir solo el 404 dejaría el enrutado roto.
- **Cifrado administrado por S3, no clave propia.** Aquí solo hay archivos que el navegador descarga en claro.
- **Sin logs de acceso de CloudFront.** Igual que el ALB: pendiente del bucket de logs común. Lo que hace cada persona en el back-office queda en `staff_audit_log`, que es la pista que importa.
- **Caché por archivo.** La política administrada `CachingOptimized` respeta el `Cache-Control` de cada objeto: el despliegue sube los assets con hash como inmutables y `index.html` como `no-cache` (runbook del back-office).

## Pruebas

`tests/static-site.tftest.hcl`: cabeceras de seguridad, fallback del router, TLS mínimo, bucket cerrado y registros de DNS.
