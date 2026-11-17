output "state_bucket" {
  description = "Bucket del estado: va en live/prd/.../backend.hcl."
  value       = aws_s3_bucket.state.id
}

output "plan_role_arn" {
  description = "Rol de plan: secreto AWS_PLAN_ROLE_ARN del repositorio."
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "Rol de apply: secreto AWS_APPLY_ROLE_ARN del environment prd."
  value       = aws_iam_role.apply.arn
}

output "backoffice_deploy_role_arn" {
  description = "Rol de publicación del back-office: secreto AWS_BACKOFFICE_DEPLOY_ROLE_ARN del environment prd."
  value       = aws_iam_role.backoffice_deploy.arn
}
