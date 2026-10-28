# Módulo `documents-bucket`

Bucket S3 privado para documentos KYC: clave KMS propia con rotación, versionado, Block Public Access, solo TLS y retención de versiones configurable. Expone la política mínima de lectura y escritura para el rol de la aplicación.

## Ejemplo

```hcl
module "documents" {
  source = "../../../../modules/documents-bucket"

  bucket_name = "ayni-prd-documents-123456789012"
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `bucket_name` | **sí** | Nombre global del bucket. |
| `noncurrent_version_expiration_days` | no | Días que se conservan las versiones reemplazadas o borradas. null las conserva siempre (retención pendiente de Legal, L5). |
| `force_destroy` | no | Permite destruir el bucket con objetos. Solo en ambientes descartables. |
| `kms_deletion_window_days` | no | Días de espera antes de borrar la clave KMS. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `bucket_name` | Nombre del bucket. |
| `bucket_arn` | ARN del bucket. |
| `kms_key_arn` | ARN de la clave KMS del bucket. |
| `read_write_policy_json` | Política mínima para leer, escribir y borrar documentos. Se adjunta al rol de la tarea de la API. |

## Pruebas

`terraform test` con provider simulado: [documents-bucket.tftest.hcl](tests/documents-bucket.tftest.hcl).
