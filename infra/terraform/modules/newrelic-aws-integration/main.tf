data "aws_caller_identity" "current" {}

locals {
  endpoints = {
    US = {
      metrics = "https://aws-api.newrelic.com/cloudwatch-metrics/v1"
      logs    = "https://aws-api.newrelic.com/firehose/v1"
    }
    EU = {
      metrics = "https://aws-api.eu01.nr-data.net/cloudwatch-metrics/v1"
      logs    = "https://aws-api.eu.newrelic.com/firehose/v1"
    }
  }[var.newrelic_region]

  # Cuenta AWS de New Relic que asume el rol de integración (fija, publicada por New Relic).
  newrelic_aws_account = "754728514883"
}

# --- Vínculo de la cuenta: New Relic lee metadatos y etiquetas con un rol de solo lectura.
data "aws_iam_policy_document" "newrelic_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.newrelic_aws_account}:root"]
    }

    # El external ID es la cuenta de New Relic: otra cuenta de New Relic no puede asumir el rol.
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [tostring(var.newrelic_account_id)]
    }
  }
}

resource "aws_iam_role" "newrelic" {
  name               = "${var.name}-newrelic-integration"
  description        = "New Relic: lectura de metadatos para la integración de AWS"
  assume_role_policy = data.aws_iam_policy_document.newrelic_assume.json
  tags               = var.tags
}

# Permisos de solo lectura que pide la integración por metric streams (ejemplo oficial de New Relic).
data "aws_iam_policy_document" "newrelic_read" {
  statement {
    actions = [
      "budgets:ViewBudget",
      "cloudtrail:LookupEvents",
      "config:BatchGetResourceConfig",
      "config:ListDiscoveredResources",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeVpcs",
      "ec2:DescribeNatGateways",
      "ec2:DescribeVpcEndpoints",
      "ec2:DescribeSubnets",
      "ec2:DescribeNetworkAcls",
      "ec2:DescribeVpcAttribute",
      "ec2:DescribeRouteTables",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeVpcPeeringConnections",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeVpnConnections",
      "health:DescribeAffectedEntities",
      "health:DescribeEventDetails",
      "health:DescribeEvents",
      "tag:GetResources",
      "xray:BatchGet*",
      "xray:Get*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "newrelic" {
  name   = "newrelic-read"
  role   = aws_iam_role.newrelic.id
  policy = data.aws_iam_policy_document.newrelic_read.json
}

resource "newrelic_cloud_aws_link_account" "this" {
  account_id             = var.newrelic_account_id
  arn                    = aws_iam_role.newrelic.arn
  metric_collection_mode = "PUSH"
  name                   = var.name

  depends_on = [aws_iam_role_policy.newrelic]
}

# --- Bucket de envíos fallidos: lo que New Relic rechaza queda aquí para reintentar o investigar.
resource "aws_s3_bucket" "failed" {
  bucket = "${var.name}-newrelic-failed-${data.aws_caller_identity.current.account_id}"
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "failed" {
  bucket = aws_s3_bucket.failed.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "failed" {
  bucket = aws_s3_bucket.failed.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "failed" {
  bucket = aws_s3_bucket.failed.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "failed" {
  bucket = aws_s3_bucket.failed.id

  rule {
    id     = "expire"
    status = "Enabled"
    filter {}

    expiration {
      days = var.failed_delivery_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "failed_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.failed.arn, "${aws_s3_bucket.failed.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "failed" {
  bucket = aws_s3_bucket.failed.id
  policy = data.aws_iam_policy_document.failed_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.failed]
}

# --- Rol de Firehose: escribe los fallidos en S3 y lee la license key del secreto.
data "aws_iam_policy_document" "firehose_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "firehose" {
  name               = "${var.name}-newrelic-firehose"
  assume_role_policy = data.aws_iam_policy_document.firehose_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "firehose" {
  statement {
    sid = "FailedDeliveries"
    actions = [
      "s3:AbortMultipartUpload", "s3:GetBucketLocation", "s3:GetObject",
      "s3:ListBucket", "s3:ListBucketMultipartUploads", "s3:PutObject",
    ]
    resources = [aws_s3_bucket.failed.arn, "${aws_s3_bucket.failed.arn}/*"]
  }

  statement {
    sid       = "LicenseKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.license_key_secret_arn]
  }
}

resource "aws_iam_role_policy" "firehose" {
  name   = "newrelic-delivery"
  role   = aws_iam_role.firehose.id
  policy = data.aws_iam_policy_document.firehose.json
}

locals {
  streams = merge(
    { metrics = { url = local.endpoints.metrics, buffer_mb = 1 } },
    # Logs: buffer de 1 MiB, porque la Logs API de New Relic rechaza envíos de más de 1 MB.
    var.logs_enabled ? { logs = { url = local.endpoints.logs, buffer_mb = 1 } } : {},
  )
}

resource "aws_kinesis_firehose_delivery_stream" "this" {
  for_each = local.streams

  name        = "${var.name}-newrelic-${each.key}"
  destination = "http_endpoint"

  http_endpoint_configuration {
    name               = "New Relic ${each.key}"
    url                = each.value.url
    role_arn           = aws_iam_role.firehose.arn
    buffering_size     = each.value.buffer_mb
    buffering_interval = 60
    retry_duration     = 300
    s3_backup_mode     = "FailedDataOnly"

    secrets_manager_configuration {
      enabled    = true
      secret_arn = var.license_key_secret_arn
      role_arn   = aws_iam_role.firehose.arn
    }

    request_configuration {
      content_encoding = "GZIP"
    }

    s3_configuration {
      role_arn           = aws_iam_role.firehose.arn
      bucket_arn         = aws_s3_bucket.failed.arn
      prefix             = "${each.key}/"
      compression_format = "GZIP"
    }
  }

  server_side_encryption {
    enabled  = true
    key_type = "AWS_OWNED_CMK"
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy.firehose]
}

# --- Metric stream: las métricas de CloudWatch llegan a New Relic casi en tiempo real.
data "aws_iam_policy_document" "metric_stream_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["streams.metrics.cloudwatch.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "metric_stream" {
  name               = "${var.name}-newrelic-metric-stream"
  assume_role_policy = data.aws_iam_policy_document.metric_stream_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "metric_stream" {
  statement {
    actions   = ["firehose:PutRecord", "firehose:PutRecordBatch"]
    resources = [aws_kinesis_firehose_delivery_stream.this["metrics"].arn]
  }
}

resource "aws_iam_role_policy" "metric_stream" {
  name   = "write-firehose"
  role   = aws_iam_role.metric_stream.id
  policy = data.aws_iam_policy_document.metric_stream.json
}

resource "aws_cloudwatch_metric_stream" "this" {
  name          = "${var.name}-newrelic"
  role_arn      = aws_iam_role.metric_stream.arn
  firehose_arn  = aws_kinesis_firehose_delivery_stream.this["metrics"].arn
  output_format = "opentelemetry1.0"

  dynamic "include_filter" {
    for_each = toset(var.metric_namespaces)
    content {
      namespace = include_filter.value
    }
  }

  tags = var.tags
}

# --- Suscripción de logs: CloudWatch Logs asume este rol para escribir en el Firehose de logs.
data "aws_iam_policy_document" "logs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["logs.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:*"]
    }
  }
}

resource "aws_iam_role" "logs_subscription" {
  count = var.logs_enabled ? 1 : 0

  name               = "${var.name}-newrelic-logs-subscription"
  assume_role_policy = data.aws_iam_policy_document.logs_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "logs_subscription" {
  count = var.logs_enabled ? 1 : 0

  statement {
    actions   = ["firehose:PutRecord", "firehose:PutRecordBatch"]
    resources = [aws_kinesis_firehose_delivery_stream.this["logs"].arn]
  }
}

resource "aws_iam_role_policy" "logs_subscription" {
  count = var.logs_enabled ? 1 : 0

  name   = "write-firehose"
  role   = aws_iam_role.logs_subscription[0].id
  policy = data.aws_iam_policy_document.logs_subscription[0].json
}
