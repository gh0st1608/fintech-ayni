output "api_url" {
  description = "URL pública de la API."
  value       = "https://${var.api_domain_name}"
}

output "alb_dns_name" {
  description = "DNS del balanceador (el dominio apunta a él con un alias de Route 53)."
  value       = module.api.alb_dns_name
}

output "route53_name_servers" {
  description = "Servidores NS de la zona delegada: se cargan en GoDaddy como registros NS de backend-ayni."
  value       = aws_route53_zone.api.name_servers
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
