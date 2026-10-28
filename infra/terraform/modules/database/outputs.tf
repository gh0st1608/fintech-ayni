output "address" {
  description = "Host de la instancia."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Puerto de PostgreSQL."
  value       = aws_db_instance.this.port
}

output "database_name" {
  description = "Base de datos inicial."
  value       = aws_db_instance.this.db_name
}

output "instance_identifier" {
  description = "Identificador, para las alarmas."
  value       = aws_db_instance.this.identifier
}

output "security_group_id" {
  description = "Security group de la base de datos."
  value       = aws_security_group.this.id
}

output "master_user_secret_arn" {
  description = "Secreto con la credencial del administrador (gestionado por RDS). Solo para migraciones."
  value       = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
}

output "settings" {
  description = "Configuración de resiliencia efectiva, para pruebas y auditoría del plan."
  value = {
    multi_az                     = aws_db_instance.this.multi_az
    deletion_protection          = aws_db_instance.this.deletion_protection
    performance_insights_enabled = aws_db_instance.this.performance_insights_enabled
    monitoring_interval          = aws_db_instance.this.monitoring_interval
    backup_retention_days        = aws_db_instance.this.backup_retention_period
  }
}

output "log_group_names" {
  description = "Grupos de logs de PostgreSQL, por tipo."
  value       = { for type, group in aws_cloudwatch_log_group.this : type => group.name }
}
