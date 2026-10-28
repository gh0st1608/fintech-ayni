# CAMBIAR: cuenta AWS dedicada (ADR, D2). Con este valor, plan y apply fallan a propósito.
aws_account_id = "000000000000"

# CAMBIAR: responsables reales para las etiquetas de costos.
owner       = "por-definir"
cost_center = "por-definir"

# CAMBIAR: cuenta de New Relic de prd. Con account_id = 0 y enabled = true, el plan falla a propósito.
new_relic = {
  enabled    = true
  account_id = 0
  region     = "US"
}

security_emails = []
