output "zone_id" {
  description = "ID de la zona Route 53 del subdominio."
  value       = aws_route53_zone.backoffice.zone_id
}

output "name_servers" {
  description = "Los 4 nameservers que debes configurar en GoDaddy como registro NS del subdominio 'backoffice'."
  value       = aws_route53_zone.backoffice.name_servers
}

output "subdomain" {
  description = "FQDN del subdominio gestionado por esta zona."
  value       = var.subdomain
}
