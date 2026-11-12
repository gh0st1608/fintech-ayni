# Acceso humano a la cuenta por IAM Identity Center: un grupo por función, con su permission set
# asignado a la cuenta. Las personas se agregan a los grupos en la consola (o desde un IdP externo):
# sus datos personales no pasan por Terraform ni por el estado.
data "aws_ssoadmin_instances" "this" {}

locals {
  instance_arn      = one(data.aws_ssoadmin_instances.this.arns)
  identity_store_id = one(data.aws_ssoadmin_instances.this.identity_store_ids)

  # Una entrada por política administrada de cada acceso.
  managed_policies = merge([
    for key, access in var.accesses : {
      for arn in access.managed_policy_arns : "${key}|${arn}" => { access = key, arn = arn }
    }
  ]...)
}

resource "aws_identitystore_group" "this" {
  for_each = var.accesses

  identity_store_id = local.identity_store_id
  display_name      = "${var.name_prefix}-${each.key}"
  description       = each.value.description
}

resource "aws_ssoadmin_permission_set" "this" {
  for_each = var.accesses

  instance_arn     = local.instance_arn
  name             = "${var.name_prefix}-${each.key}"
  description      = each.value.description
  session_duration = each.value.session_duration
  tags             = var.tags
}

resource "aws_ssoadmin_managed_policy_attachment" "this" {
  for_each = local.managed_policies

  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this[each.value.access].arn
  managed_policy_arn = each.value.arn
}

resource "aws_ssoadmin_permission_set_inline_policy" "this" {
  for_each = { for key, access in var.accesses : key => access if access.inline_policy != null }

  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this[each.key].arn
  inline_policy      = each.value.inline_policy
}

resource "aws_ssoadmin_account_assignment" "this" {
  for_each = var.accesses

  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this[each.key].arn
  principal_type     = "GROUP"
  principal_id       = aws_identitystore_group.this[each.key].group_id
  target_type        = "AWS_ACCOUNT"
  target_id          = var.account_id

  # La asignación aprovisiona el rol en la cuenta: necesita las políticas ya adjuntas.
  depends_on = [
    aws_ssoadmin_managed_policy_attachment.this,
    aws_ssoadmin_permission_set_inline_policy.this,
  ]
}
