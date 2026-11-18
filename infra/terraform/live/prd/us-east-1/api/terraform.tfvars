# Valores de prd sin secretos. image_tag no va aquí: lo pasa el pipeline (-var image_tag=<sha>).

# Cuenta AWS dedicada de prd (ADR, D2), gestión de la organización o-z52poswyp2.
aws_account_id = "079982009754"

# Responsables para las etiquetas de costos.
owner       = "plataforma-ayni"
cost_center = "ayni-prd"

# Delegado desde GoDaddy a una zona de Route 53 de esta cuenta (README, dominio).
api_domain_name = "backend-ayni.solutionserj.com"

# Zona propia, delegada desde GoDaddy igual que backend-ayni y creada por el stack dns, que se
# aplica antes que este. El sitio vive en el ápice de esa zona.
backoffice_domain_name = "backoffice.solutionserj.com"

# CAMBIAR al verificar Identity Center (COPAYNI-72). Vacío: la CSP solo deja hablar con la API.
backoffice_oidc_issuer = ""

# CAMBIAR: cuenta de New Relic de prd (la misma del stack account).
new_relic = {
  enabled    = true
  account_id = 0
  region     = "US"
}

# Activar después del primer despliegue, cuando la API ya reportó a New Relic.
slo = {
  enabled = false
}

alert_emails = []

# Envio del codigo de verificacion por correo (pending-scope T6). El remitente vive en la zona de
# la API, que ya esta delegada desde GoDaddy, asi que Terraform publica solo los 3 CNAME de DKIM.
#
# CAMBIAR route53_zone_id por el id real de aws_route53_zone.api. Tiene que ser un valor literal:
# si se tomara del recurso, su id no se conoce durante el plan y el count de los registros DKIM
# queda indeterminado. Se obtiene con:
#   terraform apply -target=aws_route53_zone.api && terraform output route53_zone_id
# CAMBIAR tambien el buzon que recibira los informes de DMARC (null: politica sin informes).
otp_messaging = {
  email = {
    domain          = "backend-ayni.solutionserj.com"
    from_address    = "Ayni <no-reply@backend-ayni.solutionserj.com>"
    route53_zone_id = "ZCAMBIARPORELIDREAL"
  }
}
dmarc_report_email = null

app_config = {
  APP_NAME    = "ayni-api"
  APP_VERSION = "0.1.0"
  LOG_LEVEL   = "info"
  # El back-office sí es un frontend web y llama a /admin desde su propio dominio.
  CORS_ALLOWED_ORIGINS = "https://backend-ayni.solutionserj.com,https://backoffice.solutionserj.com"
  REQUEST_TIMEOUT      = "30000"
  BODY_LIMIT           = "100kb"
  RATE_LIMIT_TTL       = "60000"
  RATE_LIMIT_MAX       = "100"
  # Tope propio de /admin, agregado por IP para toda la API de administración (COPAYNI-74).
  ADMIN_RATE_LIMIT_TTL = "60000"
  ADMIN_RATE_LIMIT_MAX = "300"
  # Sin esto la API no arranca: el valor por defecto es fake y production lo prohíbe (COPAYNI-85).
  # Expo Push Service no pide credenciales salvo que se active su seguridad reforzada.
  PUSH_PROVIDER = "expo"


  # Montos provisionales del Figma (pending-scope M1, M6, R15).
  DEFAULT_CURRENCY        = "PEN"
  JOIN_PAYOUT_MIN         = "300000"
  JOIN_PAYOUT_MAX         = "12000000"
  JOIN_PAYOUT_STEP        = "50000"
  SAVING_PROGRAM_MAX      = "100000000"
  CIRCLE_DURATION_OPTIONS = "6,10,12"
}
