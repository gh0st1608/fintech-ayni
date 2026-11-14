# Cuenta AWS dedicada de prd (ADR, D2), gestión de la organización o-z52poswyp2.
aws_account_id = "079982009754"

# Responsables para las etiquetas de costos.
owner       = "plataforma-ayni"
cost_center = "ayni-prd"

# CAMBIAR: cuenta de New Relic de prd. Con account_id = 0 y enabled = true, el plan falla a propósito.
new_relic = {
  enabled    = true
  account_id = 0
  region     = "US"
}

security_emails = []
