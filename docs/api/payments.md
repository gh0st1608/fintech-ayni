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

## Tarjetas guardadas: `GET` y `POST /v1/me/cards`

Pasarela: **Mercado Pago** ([architecture.md](../architecture.md#10-pasarela-de-pago-mercado-pago)). La app tokeniza la tarjeta con el SDK de Mercado Pago y envía **solo el token de un solo uso**: el backend nunca recibe el número ni el CVC, y no los registra.

`POST /v1/me/cards` (COPAYNI-40), con `Idempotency-Key` (16 a 255 caracteres `[A-Za-z0-9_-]`, una por formulario):

```json
{ "token": "ff8080814c11e237014c1ff593b57b4d" }
```

**201** (o **200** si es un reintento con la misma clave: no vuelve a la pasarela, porque el token ya se usó):

```json
{
  "id": "0b9e…",
  "brand": "visa",
  "lastFour": "0215",
  "expirationMonth": 11,
  "expirationYear": 2029,
  "isDefault": true
}
```

- La primera tarjeta queda predeterminada: con ella se cobran las cuotas.
- El backend crea el cliente de Mercado Pago del usuario la primera vez, identificado por su **email**. Un usuario que entró solo con teléfono recibe `EMAIL_REQUIRED` hasta agregar un email (COPAYNI-45). **Supuesto [?]**.
- Si el usuario ya tenía esa tarjeta, responde la existente.

`GET /v1/me/cards`: `{ "items": [SavedCard] }`, la predeterminada primero.

| Error              | HTTP | Cuándo                                                                 |
| ------------------ | ---- | ---------------------------------------------------------------------- |
| `VALIDATION_ERROR` | 400  | Falta el token o la `Idempotency-Key`, o el cuerpo trae campos de más. |
| `CARD_REJECTED`    | 422  | Mercado Pago rechazó el token o la tarjeta.                            |
| `EMAIL_REQUIRED`   | 422  | El usuario no tiene email.                                             |
| `UNAUTHORIZED`     | 401  | Sin token o token inválido.                                            |

### Gestionar tarjetas (COPAYNI-39)

- `PUT /v1/me/cards/:id/default`: la deja como la única predeterminada y responde `{ "items": [SavedCard] }`.
- `DELETE /v1/me/cards/:id` (**204**): la retira de Mercado Pago y la marca como borrada (los pagos ya hechos la siguen referenciando en la pasarela). La predeterminada solo se borra si es la única: con otras responde `DEFAULT_CARD_REPLACEMENT_REQUIRED` (409) y la app pide elegir otra.
- Errores: `CARD_NOT_FOUND` (404, no existe o no es del usuario) y `VALIDATION_ERROR` (400, el id no es UUID).
- **Pendiente [?]:** qué se puede editar de una tarjeta (pregunta abierta del ticket). Mercado Pago no permite cambiar el número; la expiración se actualiza agregando la tarjeta de nuevo.

### Débito automático de las cuotas

Con `CIRCLE_PAYMENTS_ADAPTER=gateway`, el ciclo mensual cobra cada cuota con la tarjeta predeterminada del usuario:

- Antes de cobrar busca los pagos de la cuota en Mercado Pago (`external_reference` = id de la cuota). Uno aprobado la da por pagada; uno pendiente no se vuelve a cobrar.
- Un intento por día: la clave de idempotencia es la cuota y la fecha. Si se rechaza, la cuota queda vencida y se reintenta durante la gracia (COPAYNI-57).
- **Sin tarjeta guardada no hay débito automático.** Quien paga con Yape lo hace desde la app cada mes, porque Yape pide un OTP en cada pago ([pagar una cuota](#pagar-una-cuota-desde-la-app-post-v1meinstallmentsidpay), COPAYNI-63).
- **Pendiente con Mercado Pago:** cobrar una tarjeta guardada sin CVV requiere habilitar "Automatic Payments".
- **Payouts y devoluciones:** sin riel todavía (T5). Con `gateway`, el ciclo falla al pagar un payout hasta tenerlo.

## Pagar una cuota desde la app: `POST /v1/me/installments/:id/pay`

Pago manual de una cuota `pending` u `overdue` (en gracia) con **Yape** o con una **tarjeta guardada** (COPAYNI-63, flujo D1 sin diseño). Requiere `Idempotency-Key`.

```json
{ "method": "yape", "token": "token-del-sdk" }
```

```json
{ "method": "card", "cardId": "0b9e…" }
```

- **Yape:** la app genera el token con el SDK de Mercado Pago, el celular y el OTP de la app de Yape. El token es de un solo uso.
- **200** `{ "status": "paid" | "pending", "paymentId": "…" }`. Con `paid`, la cuota ya está pagada en el ciclo y el débito automático no la vuelve a cobrar. Con `pending`, la confirma el webhook.
- Antes de cobrar busca los pagos de la cuota en Mercado Pago: si ya hay uno aprobado (p. ej. del débito automático) no cobra de nuevo, y si hay uno pendiente responde `PAYMENT_PENDING`.
- **Supuesto [?]:** se puede pagar desde que se abre el mes de la cuota, antes del vencimiento.

| Error                     | HTTP | Cuándo                                                                       |
| ------------------------- | ---- | ---------------------------------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | Método inválido, falta el token o el `cardId`, o falta la `Idempotency-Key`. |
| `INSTALLMENT_NOT_FOUND`   | 404  | La cuota no existe o no es del usuario.                                      |
| `CARD_NOT_FOUND`          | 404  | La tarjeta no es del usuario.                                                |
| `INSTALLMENT_NOT_PAYABLE` | 409  | Ya está pagada, la paga la retención o la deducción, o fue expulsado.        |
| `PAYMENT_PENDING`         | 409  | Ya hay un pago de la cuota en proceso.                                       |
| `PAYMENT_REJECTED`        | 422  | Mercado Pago lo rechazó; `details.detail` trae el motivo de la pasarela.     |
| `EMAIL_REQUIRED`          | 422  | El usuario no tiene email (Mercado Pago lo pide como pagador).               |

## Webhook de Mercado Pago: `POST /v1/webhooks/mercadopago`

Lo llama Mercado Pago, no la app (COPAYNI-63). Se configura en el panel de la aplicación de Mercado Pago, con el evento de pagos.

- **Autenticación:** la firma `x-signature` con `MERCADOPAGO_WEBHOOK_SECRET`. Sin firma válida, o sin la clave configurada, responde 401.
- **Nunca confía en el cuerpo:** consulta el pago en Mercado Pago y, si está aprobado, marca pagada la cuota de su `external_reference`, con el círculo bloqueado. Es idempotente: los reintentos no cambian nada.
- Responde 200 a todo webhook firmado, también a los de otros tipos, para que Mercado Pago no reintente. Un pago aprobado de una cuota que ya no se cobra (expulsado, mes cerrado) queda en el log `circles.cycle.payment_unmatched` para revisarlo a mano.
- En desarrollo y pruebas la pasarela es la simulada (`PAYMENT_GATEWAY=fake`); la cuenta sandbox de Mercado Pago se conecta cuando haya credenciales.
