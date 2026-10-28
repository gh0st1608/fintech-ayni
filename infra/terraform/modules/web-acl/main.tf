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
