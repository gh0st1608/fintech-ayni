# one-off-task

Task definition de una tarea ECS que se lanza, hace su trabajo y termina. No crea servicio ni
schedule: quien la lanza es el pipeline o una persona, con `aws ecs run-task`.

Se usa para las **migraciones de la base** (COPAYNI-12). Corren antes de actualizar el servicio: si
fallan, el despliegue se detiene y la versión anterior sigue sirviendo.

## Por qué tiene su propio rol de ejecución

La tarea de migración lee la **credencial maestra** de RDS, porque es la única que puede crear
tablas y conceder permisos. La API no debe poder leer ese secreto nunca: se conecta con el usuario
de aplicación, que no tiene DDL. Por eso este módulo no reutiliza el rol del servicio y crea el
suyo, con permiso solo sobre los secretos que la tarea declara.

## Uso

```hcl
module "migrate" {
  source = "../../../../modules/one-off-task"

  name           = "ayni-prd-api-migrate"
  image          = "${module.ecr.repository_url}:${var.image_tag}"
  command        = ["node", "dist/migrate.js"]
  log_group_name = module.api.log_group_name

  environment = { DB_HOST = module.database.address }
  secrets     = { DB_PASSWORD = "${module.database.master_user_secret_arn}:password::" }
}
```

Lanzarla (la familia toma siempre la última revisión):

```bash
aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$(terraform output -raw migrate_task_family)" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=DISABLED}"
```

El código de salida de la tarea no lo devuelve `run-task`: hay que esperar con
`aws ecs wait tasks-stopped` y leer `containers[0].exitCode`. El workflow de despliegue lo hace.

## Entradas y salidas

Las declaran [variables.tf](variables.tf) y [outputs.tf](outputs.tf), cada una con su descripción.

## Pruebas

`terraform test` comprueba que la tarea corre el comando indicado con el sistema de archivos de
solo lectura, que los secretos viajan por referencia y nunca como valor, y que el permiso de
lectura se concede sobre el secreto y no sobre el ARN con la clave JSON.
