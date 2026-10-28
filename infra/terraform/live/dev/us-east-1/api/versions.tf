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

  # Estado local: dev es descartable y vive solo en esta máquina, junto con el emulador.
  backend "local" {}
}
