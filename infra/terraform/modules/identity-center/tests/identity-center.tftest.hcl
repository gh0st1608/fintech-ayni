mock_provider "aws" {
  mock_data "aws_ssoadmin_instances" {
    defaults = {
      arns               = ["arn:aws:sso:::instance/ssoins-1234567890abcdef"]
      identity_store_ids = ["d-1234567890"]
    }
  }
}

variables {
  account_id  = "123456789012"
  name_prefix = "ayni-prd"
  accesses = {
    administradores = {
      description         = "Administración de la cuenta"
      managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
    }
    soporte = {
      description         = "Soporte operativo"
      managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
      inline_policy       = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
      session_duration    = "PT8H"
    }
  }
}

run "un_grupo_y_un_permission_set_por_acceso" {
  command = plan

  assert {
    condition     = aws_identitystore_group.this["soporte"].display_name == "ayni-prd-soporte"
    error_message = "El grupo lleva el prefijo y la clave del acceso."
  }

  assert {
    condition     = aws_ssoadmin_permission_set.this["soporte"].session_duration == "PT8H" && aws_ssoadmin_permission_set.this["administradores"].session_duration == "PT4H"
    error_message = "La sesión es la del acceso, PT4H por defecto."
  }

  assert {
    condition     = length(aws_ssoadmin_managed_policy_attachment.this) == 2 && length(aws_ssoadmin_permission_set_inline_policy.this) == 1
    error_message = "Solo los accesos con política inline la reciben."
  }

  assert {
    condition     = alltrue([for a in values(aws_ssoadmin_account_assignment.this) : a.target_id == "123456789012" && a.principal_type == "GROUP"])
    error_message = "Cada grupo se asigna a la cuenta; nunca personas sueltas."
  }
}

run "acceso_sin_politicas" {
  command = plan

  variables {
    accesses = { vacio = { description = "Sin permisos" } }
  }

  expect_failures = [var.accesses]
}

run "sesion_demasiado_larga" {
  command = plan

  variables {
    accesses = {
      larga = {
        description         = "Sesión de un día"
        managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
        session_duration    = "PT24H"
      }
    }
  }

  expect_failures = [var.accesses]
}
