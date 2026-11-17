# Runbook del back-office (prd)

Cómo se publica el back-office, cómo se vuelve atrás y qué lo protege. La infraestructura está en [`live/prd/us-east-1/api`](../../infra/terraform/live/prd/us-east-1/api) (módulo [`static-site`](../../infra/terraform/modules/static-site)); el front, en [`apps/backoffice`](../../apps/backoffice).

**Dirección:** `https://backoffice.solutionserj.com`, en su propia zona delegada desde GoDaddy (stack `dns`).

## Cómo está expuesto

BO8 se decidió **sin filtro de red** (COPAYNI-74): el sitio y `/admin` están en internet. Lo que los protege:

| Capa                          | Qué hace                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Login corporativo             | OIDC con MFA y step-up para los datos personales (COPAYNI-72). Sin sesión del personal, `/admin` es 401 |
| WAF, por IP                   | 600 peticiones a `/admin/` cada 5 minutos, antes de llegar a la aplicación                              |
| `ADMIN_RATE_LIMIT_MAX`        | 300 por minuto y por IP **para toda** la API de administración, dentro de la aplicación                 |
| CSP y `X-Frame-Options: DENY` | Nada en línea, nada embebible; el sitio solo habla con la API y con el proveedor de identidad           |
| `staff_audit_log`             | Cada acción del personal queda registrada, con quién y por qué                                          |

**Si el riesgo deja de ser aceptable**, el cambio es de configuración, no de código: `var.web_acl_arn` en el módulo del sitio y un `ip_set_reference_statement` en el WAF de la API acotan el acceso a las IP que se registren, y la alternativa mayor es un ALB interno con VPN.

## Publicar

1. **Actions → Publicar back-office → Run workflow.** Pide aprobación del environment `prd`.
2. Compila con las variables del environment y sube `dist/` al bucket: primero los archivos con hash (caché para siempre), después `index.html` (sin caché), y por último invalida `/index.html` en CloudFront.
3. Los mapas de origen **no se publican**: revelarían el código del back-office en un sitio público.

**Variables del environment `prd`:** `BACKOFFICE_BUCKET`, `BACKOFFICE_DISTRIBUTION_ID`, `BACKOFFICE_OIDC_ISSUER`, `BACKOFFICE_OIDC_CLIENT_ID`, `BACKOFFICE_OIDC_REDIRECT_URI`. Las dos primeras salen de los outputs del stack (`backoffice_bucket`, `backoffice_distribution_id`). **Secreto:** `AWS_BACKOFFICE_DEPLOY_ROLE_ARN`, el output `backoffice_deploy_role_arn` del bootstrap.

## Volver atrás

El bucket tiene versionado. Para revertir un despliegue malo, restaurar la versión anterior de los archivos e invalidar `/index.html`:

```bash
aws s3api list-object-versions --bucket "$BUCKET" --prefix index.html
aws s3api copy-object --bucket "$BUCKET" --key index.html \
  --copy-source "$BUCKET/index.html?versionId=<version-anterior>"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/index.html"
```

Como los assets llevan hash en el nombre y se suben con `--delete`, **el `index.html` anterior solo sirve si sus archivos siguen en el bucket**. Si el despliegue nuevo los borró, lo correcto es volver a publicar el commit anterior desde el workflow.

## Problemas frecuentes

**La pantalla queda en blanco y la consola muestra errores de CSP.** Alguna dependencia empezó a inyectar un script o un estilo en línea. No se añade `unsafe-inline`: hay que quitar esa dependencia o firmar su hash en la política de `static-site`.

**El sitio no puede llamar a la API.** Dos candidatos: `connect_src` del módulo (el navegador bloquea la llamada antes de salir) o `CORS_ALLOWED_ORIGINS` de la API (la llamada sale y el navegador descarta la respuesta). El mensaje de la consola distingue uno de otro.

**Una ruta profunda devuelve 403 o 404.** CloudFront debe traducir ambos a `index.html` con 200; lo cubre la prueba del módulo. Si pasa en vivo, revisar que `custom_error_response` siga en la distribución.

**`/admin` responde 429.** Es el tope de la administración, compartido por todas sus rutas. Si molesta en el uso normal, subir `ADMIN_RATE_LIMIT_MAX` con una razón; si es tráfico que nadie reconoce, mirar los logs del WAF (`aws-waf-logs-ayni-prd-api`) antes de subirlo.
