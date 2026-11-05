output "schedule_name" {
  description = "Schedule de EventBridge."
  value       = aws_scheduler_schedule.this.name
}

output "schedule_state" {
  description = "ENABLED o DISABLED."
  value       = aws_scheduler_schedule.this.state
}

output "task_definition_arn" {
  description = "Task definition del job, para lanzarlo a mano."
  value       = aws_ecs_task_definition.this.arn
}

output "failures_queue_url" {
  description = "Cola con los fallos del job."
  value       = aws_sqs_queue.failures.url
}
