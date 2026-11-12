# Contrato de API: ayuda y política de pagos

COPAYNI-83 (D7, Figma "Ayuda" `2052:2484`). Preguntas frecuentes y política de pagos por idioma, editables desde el back-office sin publicar la app.

## `GET /v1/help?lang=es`

**Pública** (no exige sesión), para que también sirva antes de iniciar sesión.

```json
{
  "language": "es",
  "faqs": [
    {
      "id": "…",
      "question": "¿Qué pasa si no pago a tiempo?",
      "answer": "Tienes 3 días de gracia…"
    }
  ],
  "paymentPolicy": {
    "body": "Texto plano…",
    "updatedAt": "2026-11-12T15:00:00.000Z"
  },
  "support": { "whatsapp": "https://wa.me/51999999999" }
}
```

- **Idioma:** `es` o `en`. Si el pedido no tiene contenido (ni preguntas ni política), o no se admite, se devuelve el español; `language` dice cuál llegó.
- **`paymentPolicy`:** `null` mientras Legal no apruebe el texto (L4); la app muestra que está en preparación. Los párrafos se separan con una línea vacía.
- **`support`:** `null` si no está configurado `SUPPORT_WHATSAPP_NUMBER` (solo dígitos con código de país); la app no ofrece WhatsApp. La app solo abre enlaces `https://wa.me/<dígitos>`.
- **Chat:** el Figma lo muestra, pero falta elegir el proveedor; no está implementado.

## Back-office

| Endpoint                   | Roles                                  | Qué hace                                                                                                |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /admin/v1/help/:lang` | `support`, `operations`, `super_admin` | `{ language, faqs, paymentPolicy, updatedAt, updatedBy }` tal como está, sin caer al español            |
| `PUT /admin/v1/help/:lang` | `operations`, `super_admin`            | `{ faqs: [{ question, answer }], paymentPolicy }`. Reemplaza todo el idioma, en ese orden, y se publica |

- Hasta 50 preguntas; pregunta hasta 200 caracteres y respuesta hasta 2000; política hasta 20.000. Cada pregunta necesita su respuesta (`VALIDATION_ERROR`, `details.faqs: incomplete`). Una política en blanco queda sin publicar.
- Cada cambio queda en la auditoría (`help.update`).

## Contenido inicial

La migración carga tres preguntas en español e inglés, solo con reglas ya decididas por el PO: gracia de 3 días y cargo por mora (R3), pago del pozo cuando todos pagaron (R19, provisional) y devolución con penalidad mínima del 5 % (R3). La política de pagos empieza vacía.
