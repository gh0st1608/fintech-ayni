output "task_definition_arn" {
  description = "Task definition, para lanzarla con aws ecs run-task."
  value       = aws_ecs_task_definition.this.arn
}

output "family" {
  description = "Familia de la task definition: run-task con este nombre toma siempre la última revisión."
  value       = aws_ecs_task_definition.this.family
}

output "container_name" {
  description = "Nombre del contenedor, necesario para sobrescribir el comando en run-task."
  value       = "task"
}

output "cluster_name" {
  description = "Cluster propio donde se lanza la tarea."
  value       = aws_ecs_cluster.this.name
}

output "log_group_name" {
  description = "Grupo de logs de la tarea, para leer el resultado de una ejecución."
  value       = aws_cloudwatch_log_group.this.name
}

output "execution_role_arn" {
  description = "Rol de ejecución propio de la tarea."
  value       = aws_iam_role.execution.arn
}
