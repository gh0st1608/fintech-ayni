# Estado de prd en el bucket creado por bootstrap/, en la cuenta dedicada (ADR, D2).
# Bloqueo nativo de S3: no hace falta tabla de DynamoDB (Terraform >= 1.10).
bucket       = "ayni-prd-tfstate-079982009754"
key          = "prd/us-east-1/api/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
