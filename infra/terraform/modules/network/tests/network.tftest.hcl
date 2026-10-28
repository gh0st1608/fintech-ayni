mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name               = "ayni-test"
  cidr_block         = "10.20.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

run "sin_nat_ni_flow_logs" {
  command = plan

  assert {
    condition     = length(aws_nat_gateway.this) == 0 && length(aws_route.private_nat) == 0
    error_message = "nat_gateway_mode = none no crea NAT ni rutas de salida privadas."
  }

  assert {
    condition     = length(aws_flow_log.this) == 0
    error_message = "Sin retención, los flow logs quedan apagados."
  }

  assert {
    condition     = aws_subnet.public["us-east-1a"].cidr_block == "10.20.0.0/20" && aws_subnet.private["us-east-1a"].cidr_block == "10.20.128.0/20"
    error_message = "Subredes /20: públicas desde el inicio del rango, privadas desde la mitad."
  }
}

run "un_nat_compartido" {
  command = plan

  variables {
    nat_gateway_mode = "single"
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1 && length(aws_route.private_nat) == 2
    error_message = "single: un NAT y una ruta por cada subred privada."
  }
}

run "un_nat_por_zona_y_flow_logs" {
  command = plan

  variables {
    nat_gateway_mode         = "per_az"
    flow_logs_retention_days = 30
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 2
    error_message = "per_az: un NAT por zona."
  }

  assert {
    condition     = aws_flow_log.this[0].traffic_type == "REJECT"
    error_message = "Los flow logs registran solo los rechazos."
  }
}

run "rechaza_una_sola_zona" {
  command = plan

  variables {
    availability_zones = ["us-east-1a"]
  }

  expect_failures = [var.availability_zones]
}

run "rechaza_un_cidr_chico" {
  command = plan

  variables {
    cidr_block = "10.20.0.0/18"
  }

  expect_failures = [var.cidr_block]
}
