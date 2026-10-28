locals {
  create_topic = var.security_alarms_enabled && var.notification_topic_arn == null
  topic_arn    = local.create_topic ? aws_sns_topic.this[0].arn : var.notification_topic_arn

  # Excluye a los roles de confianza (cambios ya revisados en un plan aprobado). Un evento sin
  # sessionIssuer (usuario IAM, root) siempre alarma.
  issuer = "$.userIdentity.sessionContext.sessionIssuer.userName"
  not_trusted = join("", [
    for role in var.trusted_role_names : " && ((${local.issuer} NOT EXISTS) || (${local.issuer} != \"${role}\"))"
  ])

  event_names = {
    iam_policy = [
      "DeleteGroupPolicy", "DeleteRolePolicy", "DeleteUserPolicy", "PutGroupPolicy", "PutRolePolicy",
      "PutUserPolicy", "CreatePolicy", "DeletePolicy", "CreatePolicyVersion", "DeletePolicyVersion",
      "AttachRolePolicy", "DetachRolePolicy", "AttachUserPolicy", "DetachUserPolicy",
      "AttachGroupPolicy", "DetachGroupPolicy",
    ]
    security_group = [
      "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress", "RevokeSecurityGroupIngress",
      "RevokeSecurityGroupEgress", "CreateSecurityGroup", "DeleteSecurityGroup",
    ]
    cloudtrail = ["CreateTrail", "UpdateTrail", "DeleteTrail", "StartLogging", "StopLogging"]
  }

  any_event = { for group, names in local.event_names : group => join(" || ", [for name in names : "($.eventName = \"${name}\")"]) }

  # Filtros de las recomendaciones CIS de AWS Foundations (monitoreo con CloudTrail + CloudWatch).
  security_filters = {
    root-account-usage = {
      description = "Se usó la cuenta root."
      pattern     = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
      threshold   = 1
    }
    console-login-without-mfa = {
      description = "Inicio de sesión en la consola sin MFA."
      pattern     = "{ ($.eventName = \"ConsoleLogin\") && ($.additionalEventData.MFAUsed != \"Yes\") && ($.userIdentity.type = \"IAMUser\") && ($.responseElements.ConsoleLogin = \"Success\") }"
      threshold   = 1
    }
    unauthorized-api-calls = {
      description = "Llamadas a la API rechazadas por permisos: posible credencial robada o mal configurada."
      pattern     = "{ ($.errorCode = \"*UnauthorizedOperation\") || ($.errorCode = \"AccessDenied*\") }"
      threshold   = 5
    }
    iam-policy-changes = {
      description = "Cambio de políticas IAM fuera del pipeline."
      pattern     = "{ (${local.any_event.iam_policy})${local.not_trusted} }"
      threshold   = 1
    }
    security-group-changes = {
      description = "Cambio de security groups fuera del pipeline."
      pattern     = "{ (${local.any_event.security_group})${local.not_trusted} }"
      threshold   = 1
    }
    kms-key-disabled-or-deleted = {
      description = "Una clave KMS se desactivó o se programó para borrarse: los datos cifrados con ella quedarían ilegibles."
      pattern     = "{ ($.eventSource = \"kms.amazonaws.com\") && (($.eventName = \"DisableKey\") || ($.eventName = \"ScheduleKeyDeletion\")) }"
      threshold   = 1
    }
    cloudtrail-changes = {
      description = "Se modificó o detuvo un trail de auditoría."
      pattern     = "{ ${local.any_event.cloudtrail} }"
      threshold   = 1
    }
  }
}

resource "aws_sns_topic" "this" {
  count = local.create_topic ? 1 : 0

  name              = "${var.name}-security-alarms"
  kms_master_key_id = "alias/aws/sns"
  tags              = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  for_each = local.create_topic ? toset(var.notification_emails) : toset([])

  topic_arn = aws_sns_topic.this[0].arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_log_metric_filter" "security" {
  for_each = var.security_alarms_enabled ? local.security_filters : {}

  name           = "${var.name}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.this.name
  pattern        = each.value.pattern

  metric_transformation {
    name          = each.key
    namespace     = "Ayni/Security"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "security" {
  for_each = var.security_alarms_enabled ? local.security_filters : {}

  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = "[critical] ${each.value.description} Runbook: ${var.runbook_base_url}#${each.key}"
  namespace           = "Ayni/Security"
  metric_name         = aws_cloudwatch_log_metric_filter.security[each.key].metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.topic_arn]

  tags = merge(var.tags, { Severity = "critical" })
}
