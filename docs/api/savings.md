# Contrato de API: programa de ahorro

**Estado:** catálogo, cotización (COPAYNI-32 y 33) y suscripción con el primer aporte (COPAYNI-79, diseño D5) implementados en el backend (`apps/backend/src/modules/savings`) y en mobile (`apps/mobile/src/presentation/saving`). La app no muestra una cotización incoherente (payout no posterior al inicio, cuotas que no suman el objetivo o un total sin el cashback).

Usa el contrato común de respuestas descrito en [auth.md](auth.md) y el modelo [Money](circles.md#modelo-money). Requiere `Authorization: Bearer <accessToken>`.

## Supuestos provisionales [?]

| Tema     | Supuesto                                                                                                                                                               | Variable              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Planes   | Los del Figma: Lite 3.000, Bronze 6.000, Silver 12.000, Gold 30.000, Platinum 60.000 y Diamond 100.000 (R6, M6)                                                        | `SAVING_PLANS`        |
| Nombres  | Los dos últimos se llamaban "Silver" en el Figma (duplicado): se renombraron. Llegan como claves para los JSON de idioma de la app (R12)                               | `SAVING_PLANS`        |
| Cashback | Según la duración: 5 % a 6 meses, 10 % a 12 y 20 % a 24. Calza con el ejemplo del diseño (3.150 sobre 3.000) y con el "hasta 20 % extra" (R6)                          | `SAVING_CASHBACK_BPS` |
| Tope     | Solo se ofrecen los planes hasta `SAVING_PROGRAM_MAX`                                                                                                                  | `SAVING_PROGRAM_MAX`  |
| Fechas   | **Aprobado (D5):** el primer aporte se cobra al confirmar (mes actual) y los siguientes el mismo día de cada mes; el total se recibe el mes siguiente al último aporte | —                     |

## `GET /v1/savings/plans`

```json
{
  "items": [
    {
      "id": "lite",
      "target": { "amount": 300000, "currency": "PEN" },
      "maxCashback": { "amount": 60000, "currency": "PEN" }
    }
  ],
  "durations": [6, 12, 24]
}
```

- `maxCashback` es el cashback de la duración más larga: el "hasta X extra" del diseño. Los planes van del monto menor al mayor.

## `GET /v1/savings/plans/:id/quote?months=<entero>`

```json
{
  "planId": "lite",
  "months": 6,
  "monthlyInstallment": { "amount": 50000, "currency": "PEN" },
  "installments": [{ "amount": 50000, "currency": "PEN" }],
  "target": { "amount": 300000, "currency": "PEN" },
  "cashback": { "amount": 15000, "currency": "PEN" },
  "total": { "amount": 315000, "currency": "PEN" },
  "startsOn": "2026-12",
  "payoutPeriod": "2027-06"
}
```

- `installments` trae una cuota por mes. Si el monto no se reparte exacto, las primeras llevan un céntimo más; `monthlyInstallment` es la mayor.
- `payoutPeriod` siempre es posterior a `startsOn` (el Figma tenía las fechas invertidas).
- Errores: `VALIDATION_ERROR` (400: `months` ausente o no ofrecido), `SAVING_PLAN_NOT_FOUND` (404) y `UNAUTHORIZED`.

## `POST /v1/savings/subscriptions`

COPAYNI-79. Header `Idempotency-Key` obligatorio (16 a 255 caracteres `[A-Za-z0-9_-]`).

```json
{
  "planId": "gold",
  "months": 12,
  "cardId": "<id de GET /v1/me/cards>",
  "autoDebit": true
}
```

Crea la suscripción, arma el calendario de aportes y **cobra el primer aporte** con la tarjeta guardada (Mercado Pago). Responde la suscripción (ver abajo) con `status`:

- `active`: el primer cobro se aprobó.
- `pending`: la pasarela todavía no lo confirma; la tarea diaria lo resuelve (`active` o, si se rechaza, deja de mostrarse).

| Error                     | HTTP | Cuándo                                                                                            |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | Cuerpo o `Idempotency-Key` inválidos; `months` no ofrecido (`months: not_offered`)                |
| `SAVING_PLAN_NOT_FOUND`   | 404  | El plan no existe                                                                                 |
| `CARD_NOT_FOUND`          | 404  | La tarjeta no es de la persona                                                                    |
| `SAVING_PAYMENT_REJECTED` | 422  | El primer cobro se rechazó: **no queda suscrita**. `details.detail` trae el motivo de la pasarela |
| `IDEMPOTENCY_KEY_REUSED`  | 409  | La clave ya se usó con otro plan o duración                                                       |
| `EMAIL_REQUIRED`          | 422  | La pasarela exige un email                                                                        |

- **Idempotencia:** repetir con la misma clave devuelve la misma suscripción (o el mismo rechazo) sin crear otra ni cobrar de nuevo. Tras un rechazo, la app reintenta con una clave nueva.
- **Débito automático:** con `autoDebit`, la tarea diaria (`dist/jobs/circle-cycle.js`) cobra el aporte vencido más antiguo de cada suscripción activa con la misma tarjeta (clave por aporte y día: un rechazo se reintenta al día siguiente, nunca se cobra dos veces). Al pagar el último aporte, la suscripción queda `completed`.
- **Sin débito automático:** el aporte se paga desde la app (ver abajo, COPAYNI-93).

## `POST /v1/me/savings/:id/contributions/pay`

COPAYNI-93. Header `Idempotency-Key` obligatorio y `{ "cardId": "<tarjeta guardada>" }`. Paga el aporte pendiente **más antiguo** de un plan activo, si ya venció o vence hoy (zona `BUSINESS_TIME_ZONE`). Responde el plan actualizado; con el último aporte pagado queda `completed`.

- **Idempotencia:** la clave queda guardada en el aporte pagado (`saving_contributions.payment_key`). Repetir con la misma clave devuelve el plan sin cobrar el aporte siguiente.
- Errores: `CONTRIBUTION_NOT_DUE` (422, `details.dueOn`) si el próximo aporte todavía no vence; `SAVING_PAYMENT_REJECTED` (422) si se rechaza (el aporte sigue pendiente); `SAVING_SUBSCRIPTION_NOT_FOUND` o `CARD_NOT_FOUND` (404); `VALIDATION_ERROR` (400).
- La app lo ofrece en "Mis planes de ahorro" cuando el plan no tiene débito automático y el aporte ya venció.

## `GET /v1/me/savings`

```json
{
  "items": [
    {
      "id": "…",
      "planId": "gold",
      "months": 12,
      "status": "active",
      "target": { "amount": 3000000, "currency": "PEN" },
      "cashback": { "amount": 300000, "currency": "PEN" },
      "saved": { "amount": 250000, "currency": "PEN" },
      "paidContributions": 1,
      "nextContribution": {
        "sequence": 2,
        "dueOn": "2027-01-15",
        "amount": { "amount": 250000, "currency": "PEN" },
        "status": "pending"
      },
      "payoutPeriod": "2027-12",
      "autoDebit": true,
      "card": "Visa •••• 4242"
    }
  ]
}
```

De la más reciente a la más antigua; las rechazadas no se listan.

## Supuestos por confirmar [?]

- **Retiro anticipado:** devuelve lo ahorrado sin cashback (texto de la app); el flujo de retiro no está implementado.
- **Pago del total y del cashback** al terminar: depende del riel de payouts (T5).
- **Débito automático real:** requiere los pagos recurrentes de Mercado Pago (T3); hoy se cobra con la tarjeta guardada como las cuotas.
