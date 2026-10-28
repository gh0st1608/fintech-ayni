output "ecr_repository_url" {
  description = "Destino del docker push de la imagen local."
  value       = module.ecr.repository_url
}

output "alb_dns_name" {
  description = "DNS del balanceador emulado (el emulador no enruta tráfico del ALB a ECS)."
  value       = module.api.alb_dns_name
}

output "cluster_name" {
  description = "Cluster ECS."
  value       = module.api.cluster_name
}

output "database_address" {
  description = "Host de PostgreSQL."
  value       = module.database.address
}

output "database_port" {
  description = "Puerto de PostgreSQL."
  value       = module.database.port
}

output "database_master_secret_arn" {
  description = "Secreto con la credencial del administrador."
  value       = module.database.master_user_secret_arn
}

output "documents_bucket" {
  description = "Bucket de documentos."
  value       = module.documents.bucket_name
}
