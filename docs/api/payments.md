# Contrato de API: sección Payment

**Estado:** implementado en el backend (`apps/backend/src/modules/circles`). Las pantallas de mobile están pendientes del diseño (Figma bloqueado hasta noviembre).

Usa el contrato común de respuestas descrito en [auth.md](auth.md) y el modelo [Money](circles.md#modelo-money). Requiere `Authorization: Bearer <accessToken>`.

## `GET /v1/me/payments/summary`

Resumen de la pestaña Payment (COPAYNI-35): las cuotas que el usuario todavía debe pagar y su deuda por impago.

**200**:

```json
{
  "hasDuePayments": true,
  "totalDue": { "amount": 300000, "currency": "PEN" },
  "nextDueOn": "2026-12-05",
  "debt": null,
  "duePayments": [
    {
      "circleId": "6f1c…",
      "period": "2026-12",
      "dueOn": "2026-12-05",
      "amount": { "amount": 300000, "currency": "PEN" },
      "status": "pending"
    }
  ]
}
```

| Campo            | Notas                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `duePayments`    | Cuotas `pending` u `overdue` (el cobro falló y está en gracia) de los círculos donde sigue, de la que vence antes a la última. |
| `totalDue`       | Suma de `duePayments`; `null` si no hay. Un solo país y una sola moneda en el MVP.                                             |
| `nextDueOn`      | El vencimiento más próximo (`YYYY-MM-DD`); `null` si no hay cuotas.                                                            |
| `debt`           | Deuda por impago: lo vencido más el cargo por mora (COPAYNI-57); `null` si no tiene. Mientras exista, no puede unirse.         |
| `hasDuePayments` | `true` si tiene cuotas por pagar o deuda. Sin pagos pendientes, la app muestra el estado vacío "Join New Circle".              |

- Las cuotas se cobran con el débito automático del ciclo mensual (COPAYNI-56). Pagar una cuota desde la app (D1) y la pasarela real (COPAYNI-34) están pendientes.

Errores: `UNAUTHORIZED` (401).
