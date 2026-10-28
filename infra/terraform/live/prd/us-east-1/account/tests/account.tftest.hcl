# Stack de cuenta de prd con providers simulados.
mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
}

mock_provider "newrelic" {}

variables {
  aws_account_id = "123456789012"
  new_relic      = { enabled = true, account_id = 1234567 }
}

run "auditoria_e_integracion" {
  command = plan

  assert {
    condition     = output.newrelic_license_key_secret == "ayni-prd/newrelic/license-key"
    error_message = "El secreto compartido con el stack api, por nombre."
  }

  assert {
    condition     = length(module.newrelic_aws) == 1 && length(module.cloudtrail_to_newrelic) == 1
    error_message = "Integración de AWS con New Relic y CloudTrail reenviado."
  }
}

run "sin_new_relic" {
  command = plan

  variables {
    new_relic = { enabled = false, account_id = 0 }
  }

  assert {
    condition     = length(module.newrelic_aws) == 0 && output.newrelic_license_key_secret == null
    error_message = "Sin New Relic: solo la auditoría."
  }
}

run "rechaza_new_relic_sin_cuenta" {
  command = plan

  variables {
    new_relic = { enabled = true, account_id = 0 }
  }

  expect_failures = [var.new_relic]
}
