# Grupos creados a mano en la consola antes de este stack (cuenta 079982009754). Terraform los adopta
# sin recrearlos: el de administradores ya tiene miembros. Tras el primer apply, estos bloques no
# hacen nada y pueden quedarse como registro.
import {
  to = module.identity_center.aws_identitystore_group.this["administradores"]
  id = "d-90666571e1/b43844b8-7061-70c5-1595-b6e1491fd65f"
}

import {
  to = module.identity_center.aws_identitystore_group.this["lectores"]
  id = "d-90666571e1/740804f8-1001-70eb-5606-27fe422a706a"
}

import {
  to = module.identity_center.aws_identitystore_group.this["facturadores"]
  id = "d-90666571e1/64a8a4e8-b021-70ce-0157-5679386e6b47"
}

import {
  to = module.identity_center.aws_identitystore_group.this["soporte"]
  id = "d-90666571e1/34089438-4011-70ca-5f9a-45872eab1a98"
}
