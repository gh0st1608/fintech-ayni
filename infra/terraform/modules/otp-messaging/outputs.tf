output "send_policy_json" {
  description = "Política mínima para enviar el OTP. Se adjunta al rol de la tarea de la API. null si no hay ningún canal."
  value       = local.email_enabled || local.sms_enabled ? data.aws_iam_policy_document.send.json : null
}

output "app_environment" {
  description = "Variables de entorno de la API para este envío (apps/backend/.env.example, sección OTP)."
  value = merge(
    local.email_enabled || local.sms_enabled ? { OTP_DELIVERY = "aws" } : {},
    local.email_enabled ? {
      OTP_EMAIL_FROM            = var.email.from_address
      OTP_SES_CONFIGURATION_SET = aws_sesv2_configuration_set.otp[0].configuration_set_name
    } : {},
    local.sms_enabled ? {
      OTP_SMS_ORIGINATION_IDENTITY = var.sms.origination_identity_arn
      OTP_SMS_CONFIGURATION_SET    = aws_pinpointsmsvoicev2_configuration_set.otp[0].name
    } : {},
  )
}

output "dkim_records" {
  description = "Registros CNAME de DKIM (nombre => valor). Cargarlos en el DNS del dominio si no se pasó route53_zone_id."
  value       = local.dkim_records
}
