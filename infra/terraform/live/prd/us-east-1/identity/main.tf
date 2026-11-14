# Acceso humano a la cuenta de prd por IAM Identity Center (runbook de seguridad: sin usuarios IAM
# con consola). Lo aplica un administrador, como el bootstrap: el rol de apply de CI no administra
# Identity Center. Las personas se agregan a los grupos en la consola.
data "aws_ssoadmin_instances" "this" {}

locals {
  name         = "ayni-prd"
  instance_arn = one(data.aws_ssoadmin_instances.this.arns)
  # Extrae el ID de instancia del ARN: arn:aws:sso:::instance/ssoins-xxx → ssoins-xxx
  instance_id = regex("[^/]+$", local.instance_arn)

  tags = {
    Application        = "ayni"
    Environment        = "prd"
    Owner              = var.owner
    CostCenter         = var.cost_center
    DataClassification = "confidential"
    ManagedBy          = "terraform"
    Repository         = "gh0st1608/fintech-ayni"
  }
}

# Soporte operativo: ver logs y métricas y reiniciar la API, sin cambiar la infraestructura ni leer
# datos (documentos, secretos, base).
data "aws_iam_policy_document" "support" {
  statement {
    sid = "ReadLogsAndMetrics"
    actions = [
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
      "logs:StopQuery",
      "logs:GetQueryResults",
      "logs:GetLogGroupFields",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
    ]
    resources = ["*"]
  }

  # Forzar un nuevo despliegue o detener una tarea, solo en los servicios de Ayni.
  statement {
    sid       = "RestartApi"
    actions   = ["ecs:UpdateService"]
    resources = ["arn:aws:ecs:${var.region}:${var.aws_account_id}:service/${local.name}-*/*"]
  }

  statement {
    sid       = "StopApiTasks"
    actions   = ["ecs:StopTask"]
    resources = ["arn:aws:ecs:${var.region}:${var.aws_account_id}:task/${local.name}-*/*"]
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# Back-office OIDC: aplicación personalizada en Identity Center (COPAYNI-72)
# ──────────────────────────────────────────────────────────────────────────────

# Aplicación custom OIDC PKCE: sin client secret; los usuarios se autentican con MFA y vuelven al
# back-office con un código. Los grupos de Identity Center determinan los roles de staff (groupsMap).
resource "aws_ssoadmin_application" "backoffice" {
  name                     = "${local.name}-backoffice"
  application_provider_arn = "arn:aws:sso::aws:applicationProvider/custom"
  instance_arn             = local.instance_arn
  description              = "Back-office del personal de Ayni (OIDC PKCE, sin client secret)"
  status                   = "ENABLED"

  tags = local.tags
}

# Ámbitos OAuth2 que el back-office solicita: identidad + email + perfil.
resource "aws_ssoadmin_application_access_scope" "backoffice" {
  for_each = toset(["openid", "profile", "email"])

  # `arn` es el atributo no deprecado de aws_ssoadmin_application en provider 6.x
  application_arn = aws_ssoadmin_application.backoffice.arn
  scope           = each.value
}

# Solo los grupos asignados pueden iniciar sesión; lectores quedan excluidos.
# aws_ssoadmin_application_assignment_configuration es el recurso correcto en provider 6.x.
resource "aws_ssoadmin_application_assignment_configuration" "backoffice" {
  application_arn     = aws_ssoadmin_application.backoffice.arn
  assignment_required = true
}

# Grupos con acceso al back-office: administradores, soporte y facturadores.
resource "aws_ssoadmin_application_assignment" "backoffice" {
  for_each = {
    administradores = module.identity_center.group_ids["administradores"]
    soporte         = module.identity_center.group_ids["soporte"]
    facturadores    = module.identity_center.group_ids["facturadores"]
  }

  application_arn = aws_ssoadmin_application.backoffice.arn
  principal_id    = each.value
  principal_type  = "GROUP"
}

# `aws_ssoadmin_application_grant` no existe en provider 6.68: se configura la URI de redirección
# vía AWS CLI con PutApplicationGrant (idempotente). Solo se re-ejecuta si cambia la URL.
resource "null_resource" "backoffice_grant" {
  triggers = {
    app_arn      = aws_ssoadmin_application.backoffice.arn
    redirect_uri = "${var.backoffice_url}/auth/callback"
  }

  provisioner "local-exec" {
    command = <<-CMD
      aws sso-admin put-application-grant \
        --instance-arn "${local.instance_arn}" \
        --application-arn "${aws_ssoadmin_application.backoffice.arn}" \
        --grant-type "authorization_code" \
        --grant "{\"authorizationCode\":{\"redirectUris\":[\"${var.backoffice_url}/auth/callback\"]}}"
    CMD
  }

  depends_on = [aws_ssoadmin_application.backoffice]
}

# ──────────────────────────────────────────────────────────────────────────────

module "identity_center" {
  source = "../../../../modules/identity-center"

  account_id  = var.aws_account_id
  name_prefix = local.name
  tags        = local.tags

  accesses = {
    # Bootstrap, este stack y emergencias. Sesión corta.
    administradores = {
      description         = "Administración de la cuenta: bootstrap, Identity Center y emergencias"
      managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
      session_duration    = "PT4H"
    }
    # ViewOnlyAccess y no ReadOnlyAccess: esta última lee objetos de S3 (documentos KYC).
    lectores = {
      description         = "Consulta de configuración y recursos, sin leer datos"
      managed_policy_arns = ["arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"]
      session_duration    = "PT8H"
    }
    facturadores = {
      description         = "Costos, facturas y presupuestos, sin acceso a recursos"
      managed_policy_arns = ["arn:aws:iam::aws:policy/job-function/Billing"]
      session_duration    = "PT4H"
    }
    soporte = {
      description         = "Soporte operativo: logs, métricas y reinicio de la API"
      managed_policy_arns = ["arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"]
      inline_policy       = data.aws_iam_policy_document.support.json
      session_duration    = "PT8H"
    }
  }
}
