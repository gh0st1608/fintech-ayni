mock_provider "aws" {
  # El provider valida el JSON de las políticas aun con mocks.
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  bucket_name = "ayni-test-documents"
}

run "privado_cifrado_y_versionado" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.this.block_public_acls,
      aws_s3_bucket_public_access_block.this.block_public_policy,
      aws_s3_bucket_public_access_block.this.ignore_public_acls,
      aws_s3_bucket_public_access_block.this.restrict_public_buckets,
    ])
    error_message = "Block Public Access completo."
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "Cifrado SSE-KMS por defecto."
  }

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Enabled"
    error_message = "Versionado activo."
  }

  assert {
    condition     = aws_kms_key.this.enable_key_rotation
    error_message = "Rotación de la clave activa."
  }

  assert {
    condition     = !aws_s3_bucket.this.force_destroy
    error_message = "Por defecto no se puede destruir con objetos."
  }
}

run "retencion_de_versiones_opcional" {
  command = plan

  variables {
    noncurrent_version_expiration_days = 365
  }

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.this.rule) == 2
    error_message = "Con días de retención se agrega la regla de expiración de versiones."
  }
}
