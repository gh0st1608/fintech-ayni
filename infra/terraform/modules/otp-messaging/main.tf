# Envío del código de verificación (OTP) de la API (pending-scope T6): email con SES v2 y SMS con
# AWS End User Messaging SMS. La API elige el canal según el identificador del usuario.

locals {
  email_enabled = var.email != null
  sms_enabled   = var.sms != null
}

# --- Email (SES) --------------------------------------------------------------------------------

# Rebotes y quejas a la lista de supresión de la cuenta, y solo TLS hacia el servidor de destino.
resource "aws_sesv2_configuration_set" "otp" {
  count = local.email_enabled ? 1 : 0

  configuration_set_name = "${var.name}-otp-email"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  tags = var.tags
}

# Dominio remitente con Easy DKIM de 2048 bits.
resource "aws_sesv2_email_identity" "domain" {
  count = local.email_enabled ? 1 : 0

  email_identity         = var.email.domain
  configuration_set_name = aws_sesv2_configuration_set.otp[0].configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }

  tags = var.tags
}

locals {
  dkim_records = local.email_enabled ? {
    for token in aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens :
    "${token}._domainkey.${var.email.domain}" => "${token}.dkim.amazonses.com"
  } : {}
}

# SES cuenta 3 tokens DKIM; se conocen recién en el apply, así que el count usa ese número fijo.
resource "aws_route53_record" "dkim" {
  count = local.email_enabled && try(var.email.route53_zone_id, null) != null ? 3 : 0

  zone_id = var.email.route53_zone_id
  name    = "${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.email.domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# --- SMS (End User Messaging SMS) ---------------------------------------------------------------

resource "aws_pinpointsmsvoicev2_configuration_set" "otp" {
  count = local.sms_enabled ? 1 : 0

  name                 = "${var.name}-otp-sms"
  default_message_type = "TRANSACTIONAL"

  tags = var.tags
}

# --- Permisos de la API -------------------------------------------------------------------------

# Solo enviar: desde el dominio verificado y la identidad de origen registrada, con sus
# configuration sets. Nada de administrar identidades ni leer métricas.
data "aws_iam_policy_document" "send" {
  dynamic "statement" {
    for_each = local.email_enabled ? [1] : []

    content {
      sid     = "SendOtpEmail"
      actions = ["ses:SendEmail"]
      resources = [
        aws_sesv2_email_identity.domain[0].arn,
        aws_sesv2_configuration_set.otp[0].arn,
      ]

      condition {
        test     = "StringLike"
        variable = "ses:FromAddress"
        values   = ["*@${var.email.domain}"]
      }
    }
  }

  dynamic "statement" {
    for_each = local.sms_enabled ? [1] : []

    content {
      sid     = "SendOtpSms"
      actions = ["sms-voice:SendTextMessage"]
      resources = [
        var.sms.origination_identity_arn,
        aws_pinpointsmsvoicev2_configuration_set.otp[0].arn,
      ]
    }
  }
}
