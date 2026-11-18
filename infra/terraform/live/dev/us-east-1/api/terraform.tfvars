# Configuración no secreta de la API en dev: solo lo que cambia respecto de los valores de
# producto, que viven una sola vez en modules/app-config.
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
}

# Tu cuenta de New Relic de dev (README). Con enabled = true, también activar new_relic_enabled en
# el stack account y cargar la license key en floci.
new_relic = {
  enabled    = false
  account_id = 0
  region     = "US"
}
