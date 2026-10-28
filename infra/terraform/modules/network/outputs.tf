output "vpc_id" {
  description = "ID de la VPC."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "Rango IPv4 de la VPC."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Subredes públicas, en el orden de availability_zones."
  value       = [for zone in var.availability_zones : aws_subnet.public[zone].id]
}

output "private_subnet_ids" {
  description = "Subredes privadas, en el orden de availability_zones."
  value       = [for zone in var.availability_zones : aws_subnet.private[zone].id]
}

output "has_private_egress" {
  description = "true si las subredes privadas salen a internet por NAT."
  value       = var.nat_gateway_mode != "none"
}

output "flow_logs_log_group_name" {
  description = "Grupo de logs de los flow logs (null si están desactivados)."
  value       = local.flow_logs_enabled ? aws_cloudwatch_log_group.flow_logs[0].name : null
}
