output "group_ids" {
  description = "ID de cada grupo en el identity store, por acceso."
  value       = { for key, group in aws_identitystore_group.this : key => group.group_id }
}

output "permission_set_arns" {
  description = "ARN de cada permission set, por acceso."
  value       = { for key, set in aws_ssoadmin_permission_set.this : key => set.arn }
}

output "managed_policy_arns" {
  description = "Políticas administradas de cada permission set, por acceso."
  value       = { for key, access in var.accesses : key => access.managed_policy_arns }
}
