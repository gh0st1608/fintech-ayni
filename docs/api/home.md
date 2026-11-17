# Contrato de API: contenido de Home

**Estado:** implementado (`apps/backend/src/modules/home`, COPAYNI-25). Cierra las secciones **Latest Offers** y **Popular Goals** del Figma (55:8637). Las decisiones BO4 y BO5 que lo sustentan están en [home-content-plan.md](../home-content-plan.md).

Usa el contrato común de respuestas descrito en [auth.md](auth.md).

El contenido vive en la base y lo edita el personal desde el back-office, como la ayuda (COPAYNI-83): cambiar una campaña **no exige publicar la app**.

## Decisiones que se ven en el contrato

| Tema         | Decisión                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ilustración  | Clave de un catálogo que viaja en la app (`megaphone`, `gift`, `piggy-bank`, `calendar`, `school`, `home`, `travel`, `celebration`), no un archivo subido |
| Destino      | Lista cerrada de pantallas (`savings_plans`, `join_circle`, `referral`, `help`, `none`), **nunca una URL**: con una URL libre, quien edita podría publicar un enlace externo dentro de la app |
| Segmentación | **No hay** (BO5): el contenido es el mismo para todas las personas y se puede cachear por idioma                                                           |
| Idioma       | Texto por idioma (`es` obligatorio, `en` opcional); sin traducción cae al español                                                                          |

## `GET /v1/home/content?lang=es`

Requiere `Authorization: Bearer <accessToken>`, aunque el contenido no dependa de quién mira: así se puede segmentar más adelante sin cambiar el contrato.

```json
{
  "offers": [
    {
      "id": "0f2c…",
      "title": "Nuevas ofertas",
      "subtitle": "Mira lo nuevo",
      "illustration": "megaphone",
      "background": "cream",
      "target": "referral",
      "targetAmount": null
    }
  ],
  "goals": [
    {
      "id": "7a91…",
      "title": "Ahorro",
      "subtitle": "Gana cashback al ahorrar",
      "illustration": "piggy-bank",
      "background": "primary",
      "target": "savings_plans",
      "targetAmount": null
    }
  ]
}
```

- Devuelve **solo lo activo y vigente**, ya ordenado por `position`. Una sección vacía llega como `[]` y la app la oculta.
- `subtitle` puede ser `null`: la tercera meta del Figma no tiene.
- `background` es un token del design system (`cream`, `blush`, `mint`, `lilac` en las ofertas; `primary`, `orange`, `green` en las metas): el color lo resuelve la app, nunca llega un hex del servidor.
- `targetAmount` va en unidades menores y solo acompaña a `join_circle`: precarga ese monto en el flujo de unión.
- `lang` desconocido o ausente: español.

## Back-office

`/admin/v1/home-content`, con los mismos roles que la ayuda: leen `support`, `operations` y `super_admin`; editan `operations` y `super_admin`. Cada cambio queda en `staff_audit_log`.

| Método y ruta                        | Qué hace                                        |
| ------------------------------------ | ----------------------------------------------- |
| `GET /admin/v1/home-content`         | Todo, **incluido lo apagado y lo vencido**      |
| `POST /admin/v1/home-content/offers` | Crea una lámina del carrusel                    |
| `PUT /admin/v1/home-content/offers/{id}` | La edita                                    |
| `DELETE /admin/v1/home-content/offers/{id}` | La borra (`204`)                         |
| `POST`/`PUT`/`DELETE … /goals[/{id}]` | Igual para las metas populares                  |

Cuerpo de una meta:

```json
{
  "texts": { "es": { "title": "Fiestas Patrias", "subtitle": "Arma tu junta" }, "en": { "title": "Holidays" } },
  "illustration": "celebration",
  "background": "orange",
  "target": "join_circle",
  "targetAmount": 300000,
  "position": 1,
  "active": true
}
```

La oferta agrega `background` de su paleta (`cream`, `blush`, `mint`, `lilac`) y la vigencia opcional `startsOn` / `endsOn`, que hace que una campaña caduque sola.

| Error              | HTTP | Cuándo                                                                              |
| ------------------ | ---- | ------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR` | 400  | Sin título en español, título o subtítulo demasiado largos, destino o ilustración desconocidos, monto sin `join_circle`, vigencia invertida, o más de 10 tarjetas |
| `UNAUTHORIZED`     | 401  | Sin token (de la app en `/v1`, del personal en `/admin/v1`)                          |
| `FORBIDDEN`        | 403  | El rol no edita contenido                                                            |
| `CONTENT_NOT_FOUND`| 404  | Se borra algo que ya no existe                                                       |

## Pendiente [?]

- **Contenido de Perú:** la migración siembra **una sola meta**, la del programa de ahorro, porque apunta a algo que ya existe. Las campañas ("Ramadan" es del diseño de Marruecos y no aplica) las decide el PO y se cargan desde el back-office.
- **Ilustraciones finales:** la app dibuja un icono del design system por cada clave hasta que UX entregue las ilustraciones; el contrato no cambia cuando lleguen.
- **Segmentación:** si algún día se segmenta (BO5), el modelo ya guarda el contenido por tarjeta y el endpoint ya exige sesión; faltaría el campo de audiencia y sus reglas.
