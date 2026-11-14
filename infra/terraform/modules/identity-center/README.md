# Módulo `identity-center`

Acceso humano a una cuenta AWS por IAM Identity Center. Crea, por cada función:

- un grupo en el identity store;
- un permission set con sus políticas;
- la asignación del grupo a la cuenta.

Las personas se agregan a los grupos en la consola de Identity Center o desde un IdP externo. Así sus datos personales no pasan por Terraform ni quedan en el estado.

**Requisito:** una instancia de Identity Center **de organización** ya habilitada. Una instancia de cuenta no permite asignar permisos sobre cuentas AWS. Habilitarla es un paso manual en la consola (ver el README de `infra/terraform`).

## Ejemplo

```hcl
module "identity_center" {
  source = "../../../../modules/identity-center"

  account_id  = var.aws_account_id
  name_prefix = "ayni-prd"
  accesses = {
    lectores = {
      description         = "Consulta de recursos sin cambios"
      managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
      session_duration    = "PT8H"
    }
  }
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `account_id` | **sí** | Cuenta AWS a la que dan acceso los grupos. |
| `name_prefix` | **sí** | Prefijo de los grupos y permission sets. |
| `accesses` | **sí** | Mapa de accesos. La clave es el sufijo del nombre. Cada acceso lleva `description`, `managed_policy_arns`, `inline_policy` (JSON, opcional) y `session_duration` (de `PT1H` a `PT12H`; por defecto `PT4H`). |
| `tags` | no | Etiquetas adicionales de los permission sets. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `group_ids` | ID de cada grupo en el identity store. |
| `permission_set_arns` | ARN de cada permission set. |
| `managed_policy_arns` | Políticas administradas de cada permission set. |
