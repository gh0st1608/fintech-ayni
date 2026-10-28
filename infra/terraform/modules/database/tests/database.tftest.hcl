mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name                    = "ayni-test"
  vpc_id                  = "vpc-123"
  subnet_ids              = ["subnet-a", "subnet-b"]
  allowed_security_groups = { api = "sg-api" }
}

run "seguro_por_defecto" {
  command = plan

  assert {
    condition     = aws_db_instance.this.storage_encrypted && !aws_db_instance.this.publicly_accessible
    error_message = "Cifrada y sin acceso público."
  }

  assert {
    condition     = aws_db_instance.this.manage_master_user_password
    error_message = "La contraseña la gestiona RDS en Secrets Manager."
  }

  assert {
    condition     = aws_db_instance.this.deletion_protection && !aws_db_instance.this.skip_final_snapshot
    error_message = "Protección contra borrado y snapshot final por defecto."
  }

  assert {
    condition     = contains([for parameter in aws_db_parameter_group.this.parameter : "${parameter.name}=${parameter.value}"], "rds.force_ssl=1")
    error_message = "TLS obligatorio."
  }

  assert {
    condition     = aws_db_parameter_group.this.family == "postgres17"
    error_message = "La familia del parameter group sale de la versión mayor."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.clients["api"].from_port == 5432
    error_message = "Solo PostgreSQL desde los security groups autorizados."
  }

  assert {
    condition     = length(aws_iam_role.monitoring) == 0
    error_message = "Sin Enhanced Monitoring no se crea su rol."
  }
}

run "monitoring_crea_su_rol" {
  command = plan

  variables {
    monitoring_interval = 60
  }

  assert {
    condition     = length(aws_iam_role.monitoring) == 1
    error_message = "Enhanced Monitoring necesita su rol."
  }
}

run "rechaza_una_subred" {
  command = plan

  variables {
    subnet_ids = ["subnet-a"]
  }

  expect_failures = [var.subnet_ids]
}
