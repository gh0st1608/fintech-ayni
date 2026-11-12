output "groups" {
  description = "Grupos de Identity Center: a ellos se agregan las personas en la consola."
  value       = module.identity_center.group_ids
}

output "permission_sets" {
  description = "Permission sets asignados a la cuenta."
  value       = module.identity_center.permission_set_arns
}
