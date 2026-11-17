# Valores de prd sin secretos. image_tag no va aquí: lo pasa el pipeline (-var image_tag=<sha>).

# Cuenta AWS dedicada de prd (ADR, D2), gestión de la organización o-z52poswyp2.
aws_account_id = "079982009754"

# Responsables para las etiquetas de costos.
owner       = "plataforma-ayni"
cost_center = "ayni-prd"

# Delegado desde GoDaddy a una zona de Route 53 de esta cuenta (README, dominio).
api_domain_name = "backend-ayni.solutionserj.com"

# Back-office dentro de la misma zona delegada: no hace falta tocar GoDaddy otra vez. Si se
# prefiere backoffice.solutionserj.com, hay que delegar ese nombre igual que backend-ayni.
backoffice_domain_name = "admin.backend-ayni.solutionserj.com"

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

app_config = {
  APP_NAME    = "ayni-api"
  APP_VERSION = "0.1.0"
  LOG_LEVEL   = "info"
  # El back-office sí es un frontend web y llama a /admin desde su propio dominio.
  CORS_ALLOWED_ORIGINS = "https://backend-ayni.solutionserj.com,https://admin.backend-ayni.solutionserj.com"
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
