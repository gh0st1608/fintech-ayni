# La cuenta 079982009754 ya tenía el proveedor OIDC de GitHub (creado por otro proyecto) y AWS admite
# uno solo por URL: este stack lo adopta. En una cuenta sin proveedor, quitar este bloque.
import {
  to = aws_iam_openid_connect_provider.github
  id = "arn:aws:iam::${var.aws_account_id}:oidc-provider/token.actions.githubusercontent.com"
}
