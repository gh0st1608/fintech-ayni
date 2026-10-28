terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68.0"
    }
  }

  # Primer apply con estado local; después se migra al bucket que este stack crea (README).
  backend "local" {}
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Application        = "ayni"
      Environment        = "prd"
      Owner              = var.owner
      CostCenter         = var.cost_center
      DataClassification = "confidential"
      ManagedBy          = "terraform"
      Repository         = var.github_repository
    }
  }
}
