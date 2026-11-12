# Lo aplica un administrador con su sesión de Identity Center (no el rol de apply de CI).
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.tags
  }
}
