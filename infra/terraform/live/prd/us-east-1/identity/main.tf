# Acceso humano a la cuenta de prd por IAM Identity Center (runbook de seguridad: sin usuarios IAM
# con consola). Lo aplica un administrador, como el bootstrap: el rol de apply de CI no administra
# Identity Center. Las personas se agregan a los grupos en la consola.
locals {
  name = "ayni-prd"

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
