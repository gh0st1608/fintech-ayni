mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name = "ayni-test"
}

run "sin_canales_no_crea_nada" {
  command = plan

  assert {
    condition = (
      length(aws_sesv2_email_identity.domain) == 0 &&
      length(aws_pinpointsmsvoicev2_configuration_set.otp) == 0 &&
      output.send_policy_json == null &&
      length(output.app_environment) == 0
    )
    error_message = "Sin email ni SMS, el módulo no crea recursos ni variables."
  }
}

run "email_con_dkim_tls_y_supresion" {
  command = plan

  variables {
    email = {
      domain          = "mail.ayni.pe"
      from_address    = "Ayni <no-reply@mail.ayni.pe>"
      route53_zone_id = "Z0000000000000"
    }
  }

  assert {
    condition     = one(aws_sesv2_email_identity.domain[0].dkim_signing_attributes).next_signing_key_length == "RSA_2048_BIT"
    error_message = "DKIM de 2048 bits."
  }

  assert {
    condition     = one(aws_sesv2_configuration_set.otp[0].delivery_options).tls_policy == "REQUIRE"
    error_message = "Entrega solo con TLS."
  }

  assert {
    condition     = toset(one(aws_sesv2_configuration_set.otp[0].suppression_options).suppressed_reasons) == toset(["BOUNCE", "COMPLAINT"])
    error_message = "Rebotes y quejas a la lista de supresión."
  }

  assert {
    condition     = length(aws_route53_record.dkim) == 3
    error_message = "Con zona de Route 53, publica los 3 registros DKIM."
  }

  assert {
    condition = (
      output.app_environment["OTP_DELIVERY"] == "aws" &&
      output.app_environment["OTP_EMAIL_FROM"] == "Ayni <no-reply@mail.ayni.pe>" &&
      output.app_environment["OTP_SES_CONFIGURATION_SET"] == "ayni-test-otp-email" &&
      !contains(keys(output.app_environment), "OTP_SMS_ORIGINATION_IDENTITY")
    )
    error_message = "Variables de la API solo para el email."
  }
}

run "email_sin_zona_no_publica_dns" {
  command = plan

  variables {
    email = { domain = "mail.ayni.pe", from_address = "no-reply@mail.ayni.pe" }
  }

  assert {
    condition     = length(aws_route53_record.dkim) == 0
    error_message = "Sin zona, los registros DKIM se cargan a mano (salida dkim_records)."
  }
}

run "sms_transaccional" {
  command = plan

  variables {
    sms = { origination_identity_arn = "arn:aws:sms-voice:us-east-1:111122223333:phone-number/phone-abc123" }
  }

  assert {
    condition     = aws_pinpointsmsvoicev2_configuration_set.otp[0].default_message_type == "TRANSACTIONAL"
    error_message = "Los OTP son mensajes transaccionales."
  }

  assert {
    condition = (
      output.app_environment["OTP_SMS_ORIGINATION_IDENTITY"] == "arn:aws:sms-voice:us-east-1:111122223333:phone-number/phone-abc123" &&
      output.app_environment["OTP_SMS_CONFIGURATION_SET"] == "ayni-test-otp-sms" &&
      length(aws_sesv2_email_identity.domain) == 0
    )
    error_message = "Variables de la API solo para el SMS."
  }
}

run "remitente_de_otro_dominio_falla" {
  command = plan

  variables {
    email = { domain = "mail.ayni.pe", from_address = "no-reply@otro.pe" }
  }

  expect_failures = [var.email]
}

run "identidad_de_sms_invalida_falla" {
  command = plan

  variables {
    sms = { origination_identity_arn = "+51987654321" }
  }

  expect_failures = [var.sms]
}
