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

## Aviso en el celular (push, COPAYNI-85)

**Estado:** implementado en el backend. Proveedor: **Expo Push Service** (T7, propuesto en [frontend-pending-plan.md](../frontend-pending-plan.md)); `PUSH_PROVIDER=fake` registra el envío sin salir a la red y está prohibido en production. El envío va detrás de un puerto, así que cambiar de proveedor no toca el dominio ni la app.

El push **no es una notificación nueva**: es el aviso de las que ya están en la bandeja. El texto lo arma el backend, porque cuando el aviso llega la app puede estar cerrada, y usa el idioma del perfil (`preferred_language`), con español por defecto.

Cuándo sale: la tarea diaria (`node dist/jobs/circle-cycle.js`) genera las notificaciones y, justo después, envía las que estén sin enviar. Reglas que lo hacen seguro de repetir:

- Cada notificación se marca enviada en cuanto el proveedor la acepta: una segunda corrida no vuelve a avisar lo mismo.
- Lo que la persona apagó, lo que no tiene dispositivo y lo que ya pasó de `PUSH_MAX_AGE_HOURS` (12 h) se marca igual, para que nada quede pendiente para siempre. La notificación sigue en la bandeja.
- Un fallo del proveedor deja el aviso pendiente y suma un intento; al llegar a `PUSH_MAX_ATTEMPTS` (3) se abandona, así un aviso roto no bloquea la cola.
- Basta que **un** dispositivo lo reciba para darlo por entregado.
- Si el proveedor responde `DeviceNotRegistered`, ese token queda apagado y deja de intentarse.

### `POST /v1/me/devices`

```json
{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "platform": "android" }
```

Responde `{ "deviceId": "…", "platform": "android" }`. Es idempotente por token: repetirlo no duplica el dispositivo. El token identifica la instalación, así que si vuelve con otra cuenta (alguien más inicia sesión en ese celular) cambia de dueño, y si estaba apagado por un cierre de sesión vuelve a quedar activo.

### `DELETE /v1/me/devices/{token}`

`204` sin cuerpo. Lo llama la app al cerrar sesión: ese celular deja de recibir avisos. No distingue si el token existía.

### `GET` y `PUT /v1/me/notification-preferences`

```json
{ "pushEnabled": true, "categories": { "payments": true, "circles": true, "account": true } }
```

`PUT` es un cambio parcial: lo que no se envía queda como estaba. Quien nunca las tocó las tiene todas activadas. `pushEnabled: false` apaga todo sin perder las categorías.

**Las preferencias no filtran la bandeja:** apagar una categoría deja de interrumpir, no esconde lo que pasó.

| Error              | HTTP | Cuándo                                                           |
| ------------------ | ---- | ---------------------------------------------------------------- |
| `VALIDATION_ERROR` | 400  | `token` sin formato de Expo, `platform` desconocida, cuerpo mal  |
| `UNAUTHORIZED`     | 401  | Sin token o token inválido                                       |

### Pendiente [?]

- **Recibos de entrega:** Expo devuelve un "ticket" (lo recibió), no la entrega real. Los recibos permitirían saber si el celular lo mostró; hoy solo se aprovecha `DeviceNotRegistered`, que ya llega en el ticket.
- **App:** registrar el token con `expo-notifications` exige un development build nuevo (no funciona en Expo Go).

## App

- La campana de Home muestra un punto si hay no leídas y abre la bandeja.
- La bandeja tiene las pestañas Todas, Pagos y Círculos, agrupadas en Hoy, Esta semana y Anteriores.
- Tocar una notificación la marca como leída y abre: el historial de pagos (pagos y pozos), la junta (turno de cobro y cambios del círculo) o los documentos.

## Supuestos [?]

- **Cuota por vencer:** se avisa una vez dentro de los 3 días previos (no exactamente el día 3) y otra el mismo día; si la app no se abre, la tarea diaria igual la genera.
- **Pago fallido:** hoy no hay un registro de intentos de cobro; se usa la cuota vencida sin pagar.
- **Retención:** las notificaciones no se borran todavía. Definir con Legal cuánto se conservan (L5).
