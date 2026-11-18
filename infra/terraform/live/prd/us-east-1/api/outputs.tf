output "api_url" {
  description = "URL pública de la API."
  value       = "https://${var.api_domain_name}"
}

output "backoffice_url" {
  description = "Dirección del back-office."
  value       = module.backoffice.url
}

output "backoffice_bucket" {
  description = "Bucket al que el despliegue sube el back-office compilado."
  value       = module.backoffice.bucket_name
}

output "backoffice_distribution_id" {
  description = "Distribución del back-office, para invalidar la caché después de desplegar."
  value       = module.backoffice.distribution_id
}

output "alb_dns_name" {
  description = "DNS del balanceador (el dominio apunta a él con un alias de Route 53)."
  value       = module.api.alb_dns_name
}

output "route53_name_servers" {
  description = "Servidores NS de la zona delegada: se cargan en GoDaddy como registros NS de backend-ayni."
  value       = aws_route53_zone.api.name_servers
}

output "route53_zone_id" {
  description = "ID de la zona delegada. Se copia a otp_messaging.email.route53_zone_id del tfvars."
  value       = aws_route53_zone.api.zone_id
}

output "newrelic_dashboard_url" {
  description = "Dashboard de la API en New Relic."
  value       = module.newrelic.dashboard_url
}

output "ecr_repository_url" {
  description = "Repositorio de imágenes."
  value       = module.ecr.repository_url
}

output "cluster_name" {
  description = "Cluster ECS."
  value       = module.api.cluster_name
}

output "service_name" {
  description = "Servicio ECS."
  value       = module.api.service_name
}

output "alarm_topic_arn" {
  description = "Tópico de las alarmas."
  value       = module.observability.notification_topic_arn
}

output "migrate_task_family" {
  description = "Familia de la task definition de migraciones: el pipeline la lanza con run-task antes de actualizar el servicio."
  value       = module.migrate.family
}

output "api_secrets_name" {
  description = "Secreto con las claves de la API, cuyo valor se carga fuera de Terraform."
  value       = aws_secretsmanager_secret.api.name
}

output "database_app_secret_name" {
  description = "Secreto con la credencial del usuario de aplicación de la base."
  value       = aws_secretsmanager_secret.database_app_user.name
}

output "task_subnet_ids" {
  description = "Subredes privadas donde el pipeline lanza la tarea de migraciones."
  value       = module.network.private_subnet_ids
}

output "task_security_group_id" {
  description = "Security group con el que la tarea de migraciones llega a la base."
  value       = aws_security_group.migrate.id
}

output "migrate_cluster_name" {
  description = "Cluster propio de las tareas de una sola vez, donde el pipeline lanza las migraciones."
  value       = module.migrate.cluster_name
}

output "migrate_log_group_name" {
  description = "Grupo de logs de la tarea de migraciones."
  value       = module.migrate.log_group_name
}
