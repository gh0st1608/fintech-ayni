# Zona Route 53 para el subdominio del back-office (delegación parcial desde GoDaddy).
# El dominio raíz solutionserj.com sigue en GoDaddy; solo este subdominio apunta aquí.
# Paso de activación: añadir en GoDaddy un registro NS para "backoffice" con los valores de output.

locals {
  tags = {
    Application        = "ayni"
    Environment        = "prd"
    Owner              = var.owner
    CostCenter         = var.cost_center
    DataClassification = "internal"
    ManagedBy          = "terraform"
    Repository         = "gh0st1608/fintech-ayni"
  }
}

resource "aws_route53_zone" "backoffice" {
  name    = var.subdomain
  comment = "Subdominio del back-office de Ayni (delegado desde GoDaddy)"
}
