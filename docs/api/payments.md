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

## `GET /v1/me/transactions?type=payment|payout&cursor=<texto>&limit=<entero>`

Historial de pagos y cobros (COPAYNI-41), del más reciente al más antiguo, paginado por cursor como `GET /v1/me/circles`.

- `type`: `payment` (lo que el usuario pagó) o `payout` (lo que recibió). Obligatorio.
- `limit`: de 1 a 50 (20 por defecto). `cursor`: el `nextCursor` de la página anterior.

**200**:

```json
{
  "items": [
    {
      "id": "0b9e…",
      "type": "payment",
      "kind": "installment",
      "circleId": "6f1c…",
      "period": "2026-12",
      "amount": { "amount": 300000, "currency": "PEN" },
      "occurredAt": "2026-12-05T17:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

| `kind`            | `type`    | Qué es                                                                              |
| ----------------- | --------- | ----------------------------------------------------------------------------------- |
| `installment`     | `payment` | Una cuota cobrada. Las que paga la retención del payout (COPAYNI-60) no se listan.  |
| `debt_settlement` | `payment` | La deuda por impago saldada: lo vencido más el cargo por mora (COPAYNI-57).         |
| `payout`          | `payout`  | El payout del mes de su turno, ya sin la retención.                                 |
| `refund`          | `payout`  | La devolución al expulsado antes de su turno, al cerrar el círculo. `period: null`. |

- `period` es el mes del círculo ("pagaste para el círculo del mes de…"); `occurredAt`, cuándo se cobró o pagó, en UTC.
- El detalle de una transacción no tiene diseño (D8).

Errores: `VALIDATION_ERROR` (400: `type` ausente o inválido, `limit` fuera de rango o cursor inválido) y `UNAUTHORIZED` (401).

## `GET /v1/me/payout-eligibility`

Checklist de Payout Eligibility (COPAYNI-36, Figma 55:9892). El backend calcula cada requisito; la app no lo infiere.

**200**:

```json
{
  "isEligible": false,
  "requirements": [
    { "requirement": "national_id", "status": "met" },
    { "requirement": "insurance_note", "status": "unavailable" },
    { "requirement": "payout_method", "status": "met" },
    { "requirement": "contract", "status": "unavailable" },
    { "requirement": "due_payments", "status": "met" }
  ]
}
```

| `requirement`    | Cumplido (`met`) cuando…                                                                                | Acción en la app |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| `national_id`    | El KYC verificó la identidad. **Provisional:** `JOIN_IDENTITY_CHECK` hasta COPAYNI-47                   | Scan National ID |
| `insurance_note` | Firmó el pagaré. **Sin firma electrónica todavía (D3, T9): siempre `unavailable`**                      | —                |
| `payout_method`  | Eligió un método de cobro que sigue disponible (COPAYNI-37)                                             | Payout Method    |
| `contract`       | Firmó el contrato. **Siempre `unavailable`, como el pagaré**                                            | —                |
| `due_payments`   | No tiene cuotas con el cobro fallido (`overdue`) ni deuda por impago. Una cuota por vencer no lo atrasa | Resumen de pagos |

- `status`: `met`, `pending` (le falta y puede resolverlo) o `unavailable` (le falta, pero la app todavía no permite resolverlo).
- **Hoy es informativo:** el ciclo mensual paga el payout aunque falte un requisito. Qué pasa si llega su turno sin cumplirlos está pendiente con el PO.

Errores: `UNAUTHORIZED` (401).

## `GET` y `PATCH /v1/me/payment-settings`

Preferencias de Payment Settings (COPAYNI-38, Figma 55:10052).

```json
{ "deductPayInFromPayout": true }
```

- `deductPayInFromPayout` (`false` por defecto): si en su mes de cobro también debe la cuota, la cuota no se cobra con el débito automático y se descuenta del payout. El `PATCH` recibe el mismo cuerpo y responde las preferencias guardadas.
- **Cómo lo aplica el ciclo:** al abrir el mes de cobro del miembro, su cuota queda `deducted`. Al pagar el payout se descuenta la cuota completa; la cuota base cuenta en el pozo y las fees y Admin Fees van a la cooperativa (`payin_deducted`). Con la retención de la primera mitad (COPAYNI-60), se descuentan las dos. Ejemplo sin fees: 30.000 en 10 meses, turno 3: recibe 27.000.
- Un cambio cuenta desde el próximo mes de cobro que todavía no se abrió.
- La cuota descontada no aparece en el historial de pagos: el payout aparece por lo que recibió.
- Los accesos "Change Payout Method" y "Saved Cards" de la pantalla son de la app; las tarjetas dependen de la pasarela (COPAYNI-34, 39 y 40).

Errores: `VALIDATION_ERROR` (400: falta `deductPayInFromPayout`, no es booleano o hay campos de más) y `UNAUTHORIZED` (401).
