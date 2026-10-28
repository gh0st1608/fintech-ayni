variable "name" {
  description = "Nombre del repositorio (p. ej. ayni-prd/api)."
  type        = string
}

variable "keep_images" {
  description = "Cantidad de imágenes etiquetadas que se conservan; las más viejas se borran."
  type        = number
  default     = 30

  validation {
    condition     = var.keep_images >= 5
    error_message = "Conservar al menos 5 imágenes para poder volver atrás."
  }
}

variable "force_delete" {
  description = "Permite destruir el repositorio con imágenes. Solo en ambientes descartables."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Etiquetas adicionales."
  type        = map(string)
  default     = {}
}

# Etiquetas inmutables: una etiqueta (el SHA del commit) apunta siempre a la misma imagen.
resource "aws_ecr_repository" "this" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Borrar imágenes sin etiqueta después de 7 días"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Conservar las ${var.keep_images} imágenes más recientes"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.keep_images
        }
        action = { type = "expire" }
      },
    ]
  })
}

output "repository_url" {
  description = "URL para docker push y para la task definition."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  description = "ARN del repositorio, para las políticas de despliegue."
  value       = aws_ecr_repository.this.arn
}
