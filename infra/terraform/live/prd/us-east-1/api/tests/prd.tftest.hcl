# Composición completa de prd con un provider simulado: valida el grafo (count/for_each conocidos
# en el plan) y las decisiones del ambiente sin credenciales ni cuenta real.
mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  override_data {
    target = module.network.data.aws_region.current
    values = { region = "us-east-1" }
  }
  override_data {
    target = data.aws_secretsmanager_secret.newrelic_license_key[0]
    values = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ayni-prd/newrelic/license-key-AbCdEf" }
  }
  # Zona del back-office: la crea el stack dns, no este.
  override_data {
    target = data.aws_route53_zone.backoffice
    values = { zone_id = "Z08963592LPBB80537PIS" }
  }
}

mock_provider "newrelic" {}

override_data {
  target = data.aws_kinesis_firehose_delivery_stream.newrelic_logs[0]
  values = { arn = "arn:aws:firehose:us-east-1:123456789012:deliverystream/ayni-prd-newrelic-logs" }
}

override_data {
  target = data.aws_iam_role.newrelic_logs_subscription[0]
  values = { arn = "arn:aws:iam::123456789012:role/ayni-prd-newrelic-logs-subscription" }
}

variables {
  aws_account_id = "123456789012"
  image_tag      = "abc1234"
  new_relic      = { enabled = true, account_id = 1234567 }
}

run "plan_de_prd" {
  command = plan

  assert {
    condition     = module.api.cluster_name == "ayni-prd-api"
    error_message = "Nombres con el prefijo del ambiente."
  }

  assert {
    condition     = length(module.network.private_subnet_ids) == 2 && module.network.has_private_egress
    error_message = "Tareas en subredes privadas con salida por NAT."
  }

  assert {
    condition     = output.api_url == "https://backend-ayni.solutionserj.com"
    error_message = "La API se publica solo por HTTPS en su dominio."
  }
}

# COPAYNI-74. BO8 se decidió sin filtro de red: el back-office y /admin quedan en internet, así que
# lo que los protege tiene que estar puesto y comprobado.
run "backoffice_publicado" {
  command = plan

  assert {
    condition     = output.backoffice_url == "https://backoffice.solutionserj.com"
    error_message = "El back-office se publica en su propia zona delegada, solo por HTTPS."
  }

  assert {
    condition     = strcontains(module.backoffice.content_security_policy, "https://backend-ayni.solutionserj.com")
    error_message = "Sin la API en connect-src, la CSP corta todas las llamadas del back-office."
  }

  assert {
    condition     = !strcontains(module.backoffice.content_security_policy, "unsafe-inline")
    error_message = "CSP estricta: el build no necesita scripts ni estilos en línea."
  }

  assert {
    condition     = strcontains(var.app_config["CORS_ALLOWED_ORIGINS"], "https://backoffice.solutionserj.com")
    error_message = "La API debe aceptar al back-office como origen, o el navegador bloquea /admin."
  }
}

# El adaptador real de cobros todavía no existe: el ciclo no puede quedar corriendo por defecto.
run "ciclo_de_circulos_deshabilitado" {
  command = plan

  assert {
    condition     = module.circle_cycle.schedule_state == "DISABLED"
    error_message = "El ciclo nace deshabilitado hasta que exista el adaptador real de cobros."
  }
}

# Controles que dependen de variables (checkov los marca porque también evalúa dev).
run "controles_de_prd" {
  command = plan

  assert {
    condition = alltrue([
      module.database.settings.multi_az,
      module.database.settings.deletion_protection,
      module.database.settings.performance_insights_enabled,
      module.database.settings.monitoring_interval == 60,
      module.database.settings.backup_retention_days == 30,
    ])
    error_message = "Base de datos Multi-AZ, protegida, con Performance Insights, Enhanced Monitoring y 30 días de backups."
  }

  assert {
    condition     = module.api.settings.alb_deletion_protection && !module.api.settings.assign_public_ip
    error_message = "ALB protegido contra borrado y tareas sin IP pública."
  }

  assert {
    condition     = module.api.settings.https_enabled && module.api.settings.waf_enabled
    error_message = "HTTPS con redirección desde HTTP y WAF asociado."
  }

  # La API se niega a arrancar en production con un proveedor simulado, y varios tienen ese valor
  # por defecto. Si falta uno aquí, el fallo aparece recién en el primer despliegue.
  assert {
    condition = alltrue([
      for valor in values(var.app_config) : !contains(["fake", "simulated", "dev"], valor)
    ])
    error_message = "Ningún proveedor simulado en prd: la API no arrancaría."
  }

  assert {
    condition     = lookup(var.app_config, "PUSH_PROVIDER", "fake") == "expo"
    error_message = "PUSH_PROVIDER por defecto es fake, y production lo prohíbe."
  }
}

run "rechaza_la_cuenta_de_ejemplo" {
  command = plan

  variables {
    aws_account_id = "000000000000"
  }

  expect_failures = [var.aws_account_id]
}

run "rechaza_etiquetas_que_no_son_un_sha" {
  command = plan

  variables {
    image_tag = "latest"
  }

  expect_failures = [var.image_tag]
}

# New Relic como lugar principal; CloudWatch de respaldo; dominio delegado a Route 53.
run "observabilidad_y_dominio" {
  command = plan

  assert {
    condition     = toset(keys(module.observability.alarm_arns)) == toset(["api-unhealthy-targets", "db-storage-low"])
    error_message = "CloudWatch queda solo con las alarmas de respaldo."
  }

  assert {
    condition = alltrue([for condition in [
      "ayni-prd-api-api-error-rate", "ayni-prd-api-api-latency-p95", "ayni-prd-api-synthetics-health", # gitleaks:allow (nombres de alarmas, no claves)
      "ayni-prd-api-api-cpu-high", "ayni-prd-api-db-storage-low",
    ] : contains(module.newrelic.condition_names, condition)])
    error_message = "New Relic tiene las condiciones de la API, el monitor sintético y la infraestructura."
  }

  assert {
    condition     = aws_route53_zone.api.name == "backend-ayni.solutionserj.com"
    error_message = "Zona delegada para el subdominio de la API."
  }

  assert {
    condition     = length(module.logs_to_newrelic) == 1
    error_message = "Los logs de WAF, PostgreSQL y flow logs se reenvían a New Relic."
  }
}

run "sin_new_relic" {
  command = plan

  variables {
    new_relic = { enabled = false, account_id = 0 }
  }

  assert {
    condition     = length(module.logs_to_newrelic) == 0 && module.newrelic.policy_id == null
    error_message = "Sin New Relic no se crea nada en New Relic ni se reenvían logs."
  }
}

# Envío real del OTP (pending-scope T6): apagado hasta definir el dominio remitente y registrar la
# identidad de SMS. Sin él, la API responde 503 al pedir un código, nunca da uno por enviado.
run "otp_sin_envio_por_defecto" {
  command = plan

  assert {
    condition = (
      !local.otp_enabled &&
      !contains(keys(local.api_task_policies), "otp") &&
      !contains(keys(local.api_environment), "OTP_DELIVERY")
    )
    error_message = "Sin otp_messaging no se crea nada ni se configura el envío."
  }
}

run "otp_por_email_y_sms" {
  command = plan

  variables {
    otp_messaging = {
      email = { domain = "mail.ayni.pe", from_address = "Ayni <no-reply@mail.ayni.pe>" }
      sms   = { origination_identity_arn = "arn:aws:sms-voice:us-east-1:123456789012:pool/pool-abc123" }
    }
  }

  assert {
    condition = (
      local.otp_enabled &&
      local.api_environment["OTP_DELIVERY"] == "aws" &&
      local.api_environment["OTP_EMAIL_FROM"] == "Ayni <no-reply@mail.ayni.pe>" &&
      local.api_environment["OTP_SMS_ORIGINATION_IDENTITY"] == "arn:aws:sms-voice:us-east-1:123456789012:pool/pool-abc123" &&
      contains(keys(local.api_task_policies), "otp")
    )
    error_message = "Con email y SMS, la API recibe las variables del envío y el permiso para enviar."
  }
}

# COPAYNI-12: sin estas variables la tarea arranca y se muere validando el entorno, y el health
# check del despliegue falla sin decir por qué.
run "la_api_recibe_la_base_y_sus_claves" {
  command = plan

  assert {
    condition = alltrue([
      for clave in ["DB_HOST", "DB_PORT", "DB_NAME", "DB_SSL", "DB_SSL_CA_FILE"] :
      contains(keys(local.api_environment), clave)
    ])
    error_message = "La API necesita la base en el entorno: sin DB_HOST no arranca."
  }

  assert {
    condition     = local.api_environment["DB_SSL"] == "true"
    error_message = "La base exige TLS (rds.force_ssl): con DB_SSL en false no se puede conectar."
  }

  assert {
    condition = alltrue([
      for clave in ["DB_USERNAME", "DB_PASSWORD", "JWT_PRIVATE_KEY", "OTP_PEPPER", "FIELD_ENCRYPTION_KEY"] :
      contains(keys(local.api_secrets), clave)
    ])
    error_message = "Las claves obligatorias en production llegan por secreto, no por entorno."
  }

  assert {
    condition = alltrue([
      for clave, valor in local.api_environment :
      !can(regex("(?i)(password|secret|private_key|pepper)", clave))
    ])
    error_message = "Ningún secreto puede viajar como variable de entorno en claro."
  }
}

run "la_migracion_usa_la_credencial_maestra_y_la_api_no" {
  command = plan

  assert {
    condition = alltrue([
      aws_secretsmanager_secret.database_app_user.name == "ayni-prd/db/app",
      aws_secretsmanager_secret.api.name == "ayni-prd/api/secrets",
    ])
    error_message = "Dos secretos separados: la credencial de la base se rota sin tocar las claves."
  }

  assert {
    condition     = local.migrate_environment["DB_APP_USERNAME"] == "ayni_app"
    error_message = "La migración crea el usuario con el que luego se conecta la API."
  }

  assert {
    condition     = !contains(keys(local.api_environment), "DB_APP_USERNAME")
    error_message = "La API no gestiona roles: solo el runner de migraciones toca la base como maestro."
  }

  assert {
    condition = alltrue([
      for clave in ["DB_USERNAME", "DB_PASSWORD", "DB_APP_PASSWORD"] :
      contains(keys(local.migrate_secrets), clave)
    ])
    error_message = "La migración necesita el maestro para el DDL y la contraseña del usuario de aplicación para crearlo."
  }

  assert {
    condition     = module.migrate.family == "ayni-prd-api-migrate"
    error_message = "El pipeline lanza la tarea por el nombre de su familia."
  }
}
