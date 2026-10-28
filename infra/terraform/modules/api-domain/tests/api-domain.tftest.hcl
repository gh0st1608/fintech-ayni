mock_provider "aws" {}

variables {
  domain_name = "backend-ayni.example.com"
}

run "zona_en_route53" {
  command = plan

  variables {
    route53      = { zone_id = "Z123" }
    alb_dns_name = "lb-123.us-east-1.elb.amazonaws.com"
    alb_zone_id  = "Z35SXDOTRQ7X7K"
  }

  assert {
    condition     = toset(keys(aws_route53_record.validation)) == toset(["backend-ayni.example.com"]) && length(aws_route53_record.api) == 1
    error_message = "Con la zona en Route 53, Terraform valida el certificado y crea el alias al ALB."
  }

  assert {
    condition     = aws_acm_certificate.this.validation_method == "DNS"
    error_message = "Validación por DNS: el certificado se renueva solo."
  }
}

run "dns_externo" {
  command = plan

  assert {
    condition     = length(aws_route53_record.validation) == 0 && length(aws_route53_record.api) == 0
    error_message = "Con DNS externo, los registros se crean a mano."
  }
}

run "alias_sin_balanceador" {
  command = plan

  variables {
    route53 = { zone_id = "Z123" }
  }

  expect_failures = [aws_route53_record.api]
}
