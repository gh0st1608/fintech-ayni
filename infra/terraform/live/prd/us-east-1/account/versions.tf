terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68.0"
    }
    newrelic = {
      source  = "newrelic/newrelic"
      version = "~> 3.100.0"
    }
  }

  # Configuración parcial: backend.hcl (terraform init -backend-config=backend.hcl).
  backend "s3" {}
}
