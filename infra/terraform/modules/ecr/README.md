# Módulo `ecr`

Repositorio de imágenes con etiquetas inmutables, escaneo al publicar, cifrado KMS y limpieza de imágenes viejas.

## Ejemplo

```hcl
module "ecr" {
  source = "../../../../modules/ecr"

  name        = "ayni-prd/api"
  keep_images = 30
}
```

## Entradas

| Nombre | Obligatoria | Descripción |
| --- | --- | --- |
| `name` | **sí** | Nombre del repositorio (p. ej. ayni-prd/api). |
| `keep_images` | no | Cantidad de imágenes etiquetadas que se conservan; las más viejas se borran. |
| `force_delete` | no | Permite destruir el repositorio con imágenes. Solo en ambientes descartables. |
| `tags` | no | Etiquetas adicionales. |

## Salidas

| Nombre | Descripción |
| --- | --- |
| `repository_url` | URL para docker push y para la task definition. |
| `repository_arn` | ARN del repositorio, para las políticas de despliegue. |

## Pruebas

Sin pruebas propias: lo cubren `validate`, tflint, checkov y la prueba del stack de prd.
