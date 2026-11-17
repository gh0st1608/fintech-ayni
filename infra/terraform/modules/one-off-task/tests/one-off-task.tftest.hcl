mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name    = "ayni-prd-api-migrate"
  image   = "000000000000.dkr.ecr.us-east-1.amazonaws.com/ayni-prd/api:abc123"
  command = ["node", "dist/migrate.js"]
  environment = {
    DB_HOST = "db.example.com"
    DB_NAME = "ayni"
  }
  secrets = {
    DB_USERNAME     = "arn:aws:secretsmanager:us-east-1:000000000000:secret:rds!db-1:username::"
    DB_PASSWORD     = "arn:aws:secretsmanager:us-east-1:000000000000:secret:rds!db-1:password::"
    DB_APP_PASSWORD = "arn:aws:secretsmanager:us-east-1:000000000000:secret:ayni-prd/db/app-2:password::"
  }
}

run "tarea_sin_servicio_ni_schedule" {
  command = plan

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].command == ["node", "dist/migrate.js"]
    error_message = "La tarea tiene que ejecutar el runner de migraciones, no el servidor."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].readonlyRootFilesystem
    error_message = "Sistema de archivos de solo lectura, igual que el servicio."
  }

  assert {
    condition     = aws_ecs_task_definition.this.task_role_arn == null
    error_message = "Sin rol de aplicación: a las migraciones les basta con la base."
  }
}

run "solo_puede_leer_sus_propios_secretos" {
  command = plan

  assert {
    condition = alltrue([
      for arn in local.secret_resource_arns : !strcontains(trimprefix(arn, "arn:aws:secretsmanager:us-east-1:000000000000:secret:"), ":")
    ])
    error_message = "El permiso se da sobre el secreto, no sobre el ARN con la clave JSON."
  }

  assert {
    condition     = length(local.secret_resource_arns) == 2
    error_message = "Dos secretos distintos: el maestro de RDS y el del usuario de aplicación."
  }
}

run "rol_de_ejecucion_propio_y_no_el_del_servicio" {
  command = plan

  # Si compartiera cluster o grupo de logs con el servicio, aplicar la tarea arrastraría al
  # servicio y la API se actualizaría antes de migrar.
  assert {
    condition     = aws_ecs_cluster.this.name == "ayni-prd-api-migrate"
    error_message = "La tarea tiene cluster propio: no depende del servicio."
  }

  # La migración lee la credencial maestra de RDS. Si compartiera rol con la API, la API podría
  # leerla también y conectarse con permisos de DDL (COPAYNI-12).
  assert {
    condition     = aws_iam_role.execution.name == "ayni-prd-api-migrate-execution"
    error_message = "La tarea crea su propio rol de ejecución."
  }
}

run "los_secretos_viajan_por_referencia_y_no_por_valor" {
  command = plan

  assert {
    condition = alltrue([
      for entrada in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets :
      startswith(entrada.valueFrom, "arn:aws:secretsmanager:")
    ])
    error_message = "Ningún secreto puede quedar escrito en la task definition."
  }

  assert {
    condition = alltrue([
      for entrada in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].environment :
      !strcontains(lower(entrada.name), "password")
    ])
    error_message = "Una contraseña nunca va como variable de entorno en claro."
  }
}
