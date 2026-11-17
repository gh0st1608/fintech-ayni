variable "name" {
  description = "Nombre de la web ACL."
  type        = string
}

variable "rate_limit_per_5_minutes" {
  description = "Peticiones por IP en 5 minutos antes de bloquear. Primera capa del rate limit; la API tiene la suya por tarea (ADR)."
  type        = number
  default     = 1000

  validation {
    condition     = var.rate_limit_per_5_minutes >= 100
    error_message = "WAF exige un mínimo de 100."
  }
}

variable "path_rate_limits" {
  description = "Topes más estrictos por prefijo de ruta, antes del tope general. Clave: nombre de la regla. Para /admin, que no tiene filtro de red (COPAYNI-74, BO8)."
  type = map(object({
    path_prefix              = string
    rate_limit_per_5_minutes = number
  }))
  default = {}

  validation {
    condition     = alltrue([for rule in var.path_rate_limits : rule.rate_limit_per_5_minutes >= 100])
    error_message = "WAF exige un mínimo de 100."
  }
}

variable "log_retention_days" {
  description = "Retención de los logs de peticiones bloqueadas."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}

locals {
  managed_rule_groups = {
    # Prioridad 1 queda para el rate limit.
    AWSManagedRulesCommonRuleSet          = 2
    AWSManagedRulesKnownBadInputsRuleSet  = 3
    AWSManagedRulesAmazonIpReputationList = 4
  }

  # A partir de 10 para no chocar con las de arriba. El orden entre ellas no importa: cada una
  # mira un prefijo distinto y la que no coincide deja pasar a la siguiente.
  path_rate_limits = {
    for index, name in sort(keys(var.path_rate_limits)) :
    name => merge(var.path_rate_limits[name], { priority = 10 + index })
  }
}

resource "aws_wafv2_web_acl" "this" {
  name  = var.name
  scope = "REGIONAL"
  tags  = var.tags

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5_minutes
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Tope propio de un prefijo (p. ej. /admin): se cuenta solo lo que entra por esa ruta.
  dynamic "rule" {
    for_each = local.path_rate_limits

    content {
      name     = rule.key
      priority = rule.value.priority

      action {
        block {}
      }

      statement {
        rate_based_statement {
          limit              = rule.value.rate_limit_per_5_minutes
          aggregate_key_type = "IP"

          scope_down_statement {
            byte_match_statement {
              positional_constraint = "STARTS_WITH"
              search_string         = rule.value.path_prefix

              field_to_match {
                uri_path {}
              }

              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups

    content {
      name     = rule.key
      priority = rule.value

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = var.name
    sampled_requests_enabled   = true
  }
}

# WAF exige que el grupo de logs empiece con aws-waf-logs-.
resource "aws_cloudwatch_log_group" "this" {
  name              = "aws-waf-logs-${var.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# Solo las peticiones bloqueadas: las permitidas ya están en los logs de la API.
resource "aws_wafv2_web_acl_logging_configuration" "this" {
  resource_arn            = aws_wafv2_web_acl.this.arn
  log_destination_configs = [aws_cloudwatch_log_group.this.arn]

  logging_filter {
    default_behavior = "DROP"

    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"

      condition {
        action_condition {
          action = "BLOCK"
        }
      }
    }
  }

  # No registrar cabeceras con credenciales.
  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
}

output "web_acl_arn" {
  description = "ARN de la web ACL, para asociarla al balanceador."
  value       = aws_wafv2_web_acl.this.arn
}

output "log_group_name" {
  description = "Grupo de logs de las peticiones bloqueadas (para reenviarlo a New Relic)."
  value       = aws_cloudwatch_log_group.this.name
}
