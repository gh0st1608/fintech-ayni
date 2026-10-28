# Las credenciales de AWS llegan del rol OIDC de GitHub Actions (bootstrap/); la User API key de
# New Relic, de TF_VAR_new_relic_api_key (secreto NEW_RELIC_API_KEY). No se aplica desde laptops.
provider "aws" {
  region = var.region

  # Terraform se niega a operar en cualquier otra cuenta (p. ej. el perfil por defecto de una laptop).
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.tags
  }
}

# Con New Relic desactivado no se crea nada en New Relic: los valores ficticios solo evitan pedir
# la cuenta y la key.
provider "newrelic" {
  account_id = var.new_relic.enabled ? var.new_relic.account_id : 1
  region     = var.new_relic.region
  api_key    = var.new_relic.enabled ? var.new_relic_api_key : "NRAK-DESACTIVADO"
}
