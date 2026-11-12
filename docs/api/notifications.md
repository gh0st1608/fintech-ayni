# Contrato de API: notificaciones

COPAYNI-84 (D6, Figma "Notificaciones" `2052:2373`). La bandeja de la app: vencimientos, pagos, cobros, documentos y cambios de las juntas. El envío push al celular es COPAYNI-85 y reutilizará estas notificaciones.

## Cómo se generan

Las notificaciones **se derivan de los hechos ya guardados**, sin tocar cada caso de uso: cuotas, pozos, documentos, verificaciones de identidad, eventos de pausa y membresías. Cada una tiene una clave única por persona (`dedupe_key`), así un mismo hecho nunca se notifica dos veces aunque la generación corra muchas veces.

- **La tarea diaria** (`dist/jobs/circle-cycle.js`) genera las de todas las personas al terminar el ciclo. Así los recordatorios de vencimiento existen aunque nadie abra la app. Un fallo aquí se registra (`notifications.sync_failed`) y no frena el ciclo.
- **La bandeja** genera las de la persona antes de leer, para que vea lo último.

| Tipo                    | Pestaña    | Cuándo                                                                          | `data`                         |
| ----------------------- | ---------- | ------------------------------------------------------------------------------- | ------------------------------ |
| `installment_due_soon`  | `payments` | Cuota pendiente que vence en los próximos `NOTIFICATION_DUE_SOON_DAYS` días (3) | `circleId`, `amount`, `dueOn`  |
| `installment_due_today` | `payments` | Cuota pendiente que vence hoy (zona `BUSINESS_TIME_ZONE`)                       | `circleId`, `amount`, `dueOn`  |
| `payment_received`      | `payments` | Cuota pagada                                                                    | `circleId`, `amount`, `period` |
| `payment_failed`        | `payments` | Cuota vencida sin cobrar (`overdue` o `defaulted`)                              | `circleId`, `amount`, `dueOn`  |
| `payout_turn`           | `payments` | Empieza el mes en que la persona cobra, con la junta en curso                   | `circleId`, `amount`, `period` |
| `payout_disbursed`      | `payments` | Pozo entregado                                                                  | `circleId`, `amount`, `period` |
| `document_approved`     | `account`  | Documento KYC aprobado o verificación de identidad aprobada                     | `documentType`                 |
| `document_rejected`     | `account`  | Documento KYC rechazado o verificación de identidad rechazada                   | `documentType`                 |
| `circle_started`        | `circles`  | La junta empezó (`contributing`, `paused` o `finished`)                         | `circleId`, `period`           |
| `circle_paused`         | `circles`  | El personal pausó la junta                                                      | `circleId`                     |
| `circle_resumed`        | `circles`  | El personal reanudó la junta                                                    | `circleId`                     |
| `circle_member_joined`  | `circles`  | Otra persona se unió mientras la junta se arma (`collecting` o `approving`)     | `circleId`                     |

- `documentType`: `national_id`, `proof_of_income`, `additional` o `identity` (VerificaID).
- **Sin datos de otras personas:** "nuevo miembro" no dice quién.
- **Sin texto en el backend:** la app arma el mensaje en el idioma de la persona. Un tipo que la app no conoce se omite.

## `GET /v1/me/notifications?category=&limit=&cursor=`

```json
{
  "items": [
    {
      "id": "6f1c…",
      "type": "installment_due_soon",
      "category": "payments",
      "data": {
        "circleId": "…",
        "amount": { "amount": 56000, "currency": "PEN" },
        "dueOn": "2026-12-01"
      },
      "occurredAt": "2026-11-28T05:00:00.000Z",
      "read": false
    }
  ],
  "nextCursor": null,
  "unread": 3
}
```

- `category`: `payments`, `circles` o `account`; sin valor, todas.
- De la más reciente a la más antigua por `occurredAt` (cuándo ocurrió el hecho). `limit` entre 1 y 50 (20 por defecto).
- `unread` cuenta las no leídas de todas las categorías.

## `GET /v1/me/notifications/unread-count`

`{ "unread": 3 }`. El punto de la campana del header de Home.

## `POST /v1/me/notifications/read`

`{ "ids": ["…"] }` marca esas (hasta 100); `{}` marca todas. Responde `{ "unread": n }`. Solo toca las de la persona: un id ajeno se ignora.

| Error              | HTTP | Cuándo                                          |
| ------------------ | ---- | ----------------------------------------------- |
| `VALIDATION_ERROR` | 400  | `category`, `limit`, `cursor` o `ids` inválidos |
| `UNAUTHORIZED`     | 401  | Sin token o token inválido                      |

## App

- La campana de Home muestra un punto si hay no leídas y abre la bandeja.
- La bandeja tiene las pestañas Todas, Pagos y Círculos, agrupadas en Hoy, Esta semana y Anteriores.
- Tocar una notificación la marca como leída y abre: el historial de pagos (pagos y pozos), la junta (turno de cobro y cambios del círculo) o los documentos.

## Supuestos [?]

- **Cuota por vencer:** se avisa una vez dentro de los 3 días previos (no exactamente el día 3) y otra el mismo día; si la app no se abre, la tarea diaria igual la genera.
- **Pago fallido:** hoy no hay un registro de intentos de cobro; se usa la cuota vencida sin pagar.
- **Retención:** las notificaciones no se borran todavía. Definir con Legal cuánto se conservan (L5).
