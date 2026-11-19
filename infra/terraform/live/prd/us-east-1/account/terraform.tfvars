# Cuenta AWS dedicada de prd (ADR, D2), gestión de la organización o-z52poswyp2.
aws_account_id = "079982009754"

# Responsables para las etiquetas de costos.
owner       = "plataforma-ayni"
cost_center = "ayni-prd"

# Cuenta de New Relic de prd. La User API key no va aquí: llega por TF_VAR_new_relic_api_key.
new_relic = {
  enabled    = true
  account_id = 8067917
  region     = "US"
}

security_emails = []
