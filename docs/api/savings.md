# Contrato de API: programa de ahorro

**Estado:** catálogo y cotización implementados en el backend (`apps/backend/src/modules/savings`, COPAYNI-32 y 33) y en mobile (`apps/mobile/src/presentation/saving`: Choose a Saving Circle y Choose Duration, sin validar contra el Figma). La app no muestra una cotización incoherente (payout no posterior al inicio, cuotas que no suman el objetivo o un total sin el cashback). La suscripción y el primer pago esperan el diseño de la confirmación (D5): "Siguiente" lo avisa sin cerrar la hoja.

Usa el contrato común de respuestas descrito en [auth.md](auth.md) y el modelo [Money](circles.md#modelo-money). Requiere `Authorization: Bearer <accessToken>`.

## Supuestos provisionales [?]

| Tema     | Supuesto                                                                                                                                      | Variable              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Planes   | Los del Figma: Lite 3.000, Bronze 6.000, Silver 12.000, Gold 30.000, Platinum 60.000 y Diamond 100.000 (R6, M6)                               | `SAVING_PLANS`        |
| Nombres  | Los dos últimos se llamaban "Silver" en el Figma (duplicado): se renombraron. Llegan como claves para los JSON de idioma de la app (R12)      | `SAVING_PLANS`        |
| Cashback | Según la duración: 5 % a 6 meses, 10 % a 12 y 20 % a 24. Calza con el ejemplo del diseño (3.150 sobre 3.000) y con el "hasta 20 % extra" (R6) | `SAVING_CASHBACK_BPS` |
| Tope     | Solo se ofrecen los planes hasta `SAVING_PROGRAM_MAX`                                                                                         | `SAVING_PROGRAM_MAX`  |
| Fechas   | La primera cuota es el mes siguiente al actual (`CIRCLE_START_OFFSET_MONTHS`); el total se recibe el mes siguiente a la última cuota          | —                     |

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

**Pendiente:** `POST /v1/savings/subscriptions` (idempotente) con la confirmación y el primer pago (D5).
