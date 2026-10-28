# Estado de prd en el bucket creado por bootstrap/. CAMBIAR el ID de cuenta al definir la cuenta
# dedicada (ADR, D2). Bloqueo nativo de S3: no hace falta tabla de DynamoDB (Terraform >= 1.10).
bucket       = "ayni-prd-tfstate-CAMBIAR_ACCOUNT_ID"
key          = "prd/us-east-1/api/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
