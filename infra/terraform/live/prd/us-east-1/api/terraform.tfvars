# Valores de prd sin secretos. image_tag no va aquí: lo pasa el pipeline (-var image_tag=<sha>).

# Cuenta AWS dedicada de prd (ADR, D2), gestión de la organización o-z52poswyp2.
aws_account_id = "079982009754"

# Responsables para las etiquetas de costos.
owner       = "plataforma-ayni"
cost_center = "ayni-prd"

# Delegado desde GoDaddy a una zona de Route 53 de esta cuenta (README, dominio).
api_domain_name = "backend-ayni.solutionserj.com"

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

app_config = {
  APP_NAME    = "ayni-api"
  APP_VERSION = "0.1.0"
  LOG_LEVEL   = "info"
  # Todavía no hay frontend web (la app mobile no usa CORS): solo el propio dominio.
  CORS_ALLOWED_ORIGINS = "https://backend-ayni.solutionserj.com"
  REQUEST_TIMEOUT      = "30000"
  BODY_LIMIT           = "100kb"
  RATE_LIMIT_TTL       = "60000"
  RATE_LIMIT_MAX       = "100"


  # Montos provisionales del Figma (pending-scope M1, M6, R15).
  DEFAULT_CURRENCY        = "PEN"
  JOIN_PAYOUT_MIN         = "300000"
  JOIN_PAYOUT_MAX         = "12000000"
  JOIN_PAYOUT_STEP        = "50000"
  SAVING_PROGRAM_MAX      = "100000000"
  CIRCLE_DURATION_OPTIONS = "6,10,12"
}
