mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name               = "ayni-test-api"
  vpc_id             = "vpc-123"
  alb_subnet_ids     = ["subnet-a", "subnet-b"]
  service_subnet_ids = ["subnet-c", "subnet-d"]
  image              = "123456789012.dkr.ecr.us-east-1.amazonaws.com/ayni/api:abc1234"
  environment        = { NODE_ENV = "production" }
}

run "sin_certificado_solo_http" {
  command = plan

  assert {
    condition     = length(aws_lb_listener.https) == 0 && aws_lb_listener.http.default_action[0].type == "forward"
    error_message = "Sin certificado, el listener HTTP reenvía a las tareas."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].readonlyRootFilesystem
    error_message = "El contenedor corre con el sistema de archivos de solo lectura."
  }

  assert {
    condition     = aws_ecs_service.this.deployment_circuit_breaker[0].enable && aws_ecs_service.this.deployment_circuit_breaker[0].rollback
    error_message = "Circuit breaker con rollback automático."
  }

  assert {
    condition     = aws_lb_target_group.this.health_check[0].path == "/health/live"
    error_message = "El ALB comprueba /health/live."
  }

  assert {
    condition     = aws_lb.this.drop_invalid_header_fields
    error_message = "El ALB descarta cabeceras inválidas."
  }

  assert {
    condition     = length(aws_iam_role_policy.read_secrets) == 0 && length(aws_appautoscaling_target.this) == 0
    error_message = "Sin secretos ni autoescalado no se crean sus recursos."
  }
}

run "con_certificado_redirige_a_https" {
  command = plan

  variables {
    https = { certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/abc" }
  }

  assert {
    condition     = length(aws_lb_listener.https) == 1 && aws_lb_listener.http.default_action[0].type == "redirect"
    error_message = "Con certificado: HTTPS en 443 y HTTP redirige."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.alb) == 2
    error_message = "El balanceador abre 80 y 443."
  }

  assert {
    condition     = aws_lb_listener.https[0].ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06"
    error_message = "TLS 1.2 como mínimo, con TLS 1.3."
  }
}

run "secretos_acotados_a_su_arn" {
  command = plan

  variables {
    secrets = {
      DATABASE_PASSWORD     = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-1-AbCdEf:password::"
      NEW_RELIC_LICENSE_KEY = "arn:aws:secretsmanager:us-east-1:123456789012:secret:nr-XyZ123"
    }
  }

  assert {
    condition = toset(local.secret_resource_arns) == toset([
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-1-AbCdEf",
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:nr-XyZ123",
    ])
    error_message = "La política del rol de ejecución usa el ARN del secreto, sin la clave JSON."
  }

  assert {
    condition     = length(jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets) == 2
    error_message = "Los secretos se inyectan como variables de entorno."
  }
}

run "autoescalado_por_cpu" {
  command = plan

  variables {
    autoscaling = { min_capacity = 2, max_capacity = 4, cpu_target_percent = 60 }
  }

  assert {
    condition     = aws_appautoscaling_target.this[0].min_capacity == 2 && aws_appautoscaling_target.this[0].max_capacity == 4
    error_message = "El autoescalado respeta los límites."
  }
}

run "rechaza_secretos_que_no_son_arn" {
  command = plan

  variables {
    secrets = { API_KEY = "texto-plano" }
  }

  expect_failures = [var.secrets]
}

run "rechaza_autoescalado_invertido" {
  command = plan

  variables {
    autoscaling = { min_capacity = 4, max_capacity = 2, cpu_target_percent = 60 }
  }

  expect_failures = [var.autoscaling]
}
