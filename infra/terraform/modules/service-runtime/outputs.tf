output "cluster_name" {
  description = "Cluster ECS."
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "Servicio ECS."
  value       = aws_ecs_service.this.name
}

output "security_group_id" {
  description = "Security group de las tareas: se autoriza en la base de datos."
  value       = aws_security_group.service.id
}

output "alb_dns_name" {
  description = "DNS del balanceador (destino del registro del dominio)."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone del balanceador, para un registro alias."
  value       = aws_lb.this.zone_id
}

output "alb_arn_suffix" {
  description = "Dimensión LoadBalancer de las métricas del ALB."
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  description = "Dimensión TargetGroup de las métricas del ALB."
  value       = aws_lb_target_group.this.arn_suffix
}

output "log_group_name" {
  description = "Logs del contenedor."
  value       = aws_cloudwatch_log_group.this.name
}

output "task_role_arn" {
  description = "Rol de la aplicación."
  value       = aws_iam_role.task.arn
}

output "execution_role_arn" {
  description = "Rol de ejecución de ECS."
  value       = aws_iam_role.execution.arn
}

output "settings" {
  description = "Configuración de exposición efectiva, para pruebas y auditoría del plan."
  value = {
    https_enabled           = local.https
    waf_enabled             = var.waf != null
    assign_public_ip        = var.assign_public_ip
    alb_deletion_protection = aws_lb.this.enable_deletion_protection
  }
}
