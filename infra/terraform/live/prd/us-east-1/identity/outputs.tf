output "groups" {
  description = "Grupos de Identity Center: a ellos se agregan las personas en la consola."
  value       = module.identity_center.group_ids
}

output "permission_sets" {
  description = "Permission sets asignados a la cuenta."
  value       = module.identity_center.permission_set_arns
}

output "backoffice_application_arn" {
  description = "ARN de la aplicación OIDC del back-office. Úsalo como VITE_OIDC_CLIENT_ID."
  value       = aws_ssoadmin_application.backoffice.arn
}

output "backoffice_issuer_url" {
  description = "Issuer OIDC de Identity Center. Valor para STAFF_OIDC_ISSUER / VITE_OIDC_ISSUER."
  value       = "https://identitycenter.amazonaws.com/${local.instance_id}"
}
