# Configuración no secreta de la API en dev. Los montos son los provisionales del Figma
# (pending-scope M1, M6, R15); los mismos que apps/backend/.env.example.
app_config = {
  APP_NAME             = "ayni-api"
  APP_VERSION          = "0.1.0"
  LOG_LEVEL            = "debug"
  CORS_ALLOWED_ORIGINS = "http://localhost:8081"
  REQUEST_TIMEOUT      = "30000"
  BODY_LIMIT           = "100kb"
  RATE_LIMIT_TTL       = "60000"
  RATE_LIMIT_MAX       = "100"
  ENABLE_SWAGGER       = "true"

  DEFAULT_CURRENCY        = "PEN"
  JOIN_PAYOUT_MIN         = "300000"
  JOIN_PAYOUT_MAX         = "12000000"
  JOIN_PAYOUT_STEP        = "50000"
  SAVING_PROGRAM_MAX      = "100000000"
  CIRCLE_DURATION_OPTIONS = "6,10,12"
}

# Tu cuenta de New Relic de dev (README). Con enabled = true, también activar new_relic_enabled en
# el stack account y cargar la license key en floci.
new_relic = {
  enabled    = false
  account_id = 0
  region     = "US"
}
