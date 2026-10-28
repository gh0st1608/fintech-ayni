output "policy_id" {
  description = "Política de alertas (null si el módulo está desactivado)."
  value       = var.enabled ? newrelic_alert_policy.this[0].id : null
}

output "dashboard_url" {
  description = "Enlace al dashboard."
  value       = var.enabled ? newrelic_one_dashboard.this[0].permalink : null
}

output "condition_names" {
  description = "Condiciones de alerta creadas."
  value = concat(
    [for condition in newrelic_nrql_alert_condition.api : condition.name],
    [for condition in newrelic_nrql_alert_condition.infra : condition.name],
    [for condition in newrelic_nrql_alert_condition.availability_fast_burn : condition.name],
    [for condition in newrelic_nrql_alert_condition.synthetics : condition.name],
  )
}
