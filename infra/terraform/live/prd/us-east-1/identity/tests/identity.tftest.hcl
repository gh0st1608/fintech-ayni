# Stack de Identity Center de prd con provider simulado.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_ssoadmin_instances" {
    defaults = {
      arns               = ["arn:aws:sso:::instance/ssoins-1234567890abcdef"]
      identity_store_ids = ["d-1234567890"]
    }
  }
}

variables {
  aws_account_id = "123456789012"
  owner          = "plataforma"
  cost_center    = "ayni"
}

run "cuatro_accesos" {
  command = plan

  assert {
    condition     = toset(keys(module.identity_center.permission_set_arns)) == toset(["administradores", "solo-lectura", "facturacion", "soporte"])
    error_message = "Administradores, solo lectura, facturación y soporte."
  }
}

run "solo_lectura_no_lee_datos" {
  command = plan

  assert {
    condition     = !contains(flatten(values(module.identity_center.managed_policy_arns)), "arn:aws:iam::aws:policy/ReadOnlyAccess")
    error_message = "ReadOnlyAccess lee objetos de S3 (documentos KYC): no se usa."
  }
}

run "cuenta_de_ejemplo" {
  command = plan

  variables {
    aws_account_id = "000000000000"
  }

  expect_failures = [var.aws_account_id]
}
