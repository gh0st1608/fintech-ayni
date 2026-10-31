# Contrato de API: referidos

**Estado:** implementado en el backend (`apps/backend/src/modules/referrals`) y en mobile (`apps/mobile/src/presentation/referrals`: Refer a friend y My Referrals, sin validar contra el Figma). La app guarda el código de `ayni://invite?code=…` (validado; uno mal formado se ignora) y lo envía con `POST /v1/me/referral/claim` al entrar con sesión. Un rechazo del backend descarta el código; un fallo transitorio lo reintenta en el siguiente arranque.

Usa el contrato común de respuestas descrito en [auth.md](auth.md) y el modelo [Money](circles.md#modelo-money). Requiere `Authorization: Bearer <accessToken>`.

## Reglas provisionales (pending-scope R7) [?]

| Regla       | Valor provisional                                                               | Variable                        |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------- |
| Beneficio   | S/150 (el monto del Figma), igual para el invitado y para el invitador          | `REFERRAL_REWARD_AMOUNT`        |
| Moneda      | La de operación                                                                 | `DEFAULT_CURRENCY`              |
| Tope        | 10 invitados con beneficio por invitador; los demás se registran, pero no suman | `REFERRAL_MAX_REWARDED_INVITES` |
| Vencimiento | El saldo no vence                                                               | —                               |
| Enlace      | Deep link de la app: `ayni://invite?code=…`                                     | `REFERRAL_LINK_BASE_URL`        |

El beneficio queda congelado al usar el código: un cambio posterior de la configuración no altera los referidos ya registrados. Falta elegir el proveedor de deep links diferidos, que conserva el código después de instalar la app desde la tienda.

## `GET /v1/me/referral`

El código, el enlace y el beneficio (COPAYNI-51). El código se crea en la primera consulta y no cambia: 8 caracteres sin `0`, `O`, `1`, `I` ni `L`.

```json
{
  "code": "K7M2Q9XA",
  "link": "ayni://invite?code=K7M2Q9XA",
  "reward": { "amount": 15000, "currency": "PEN" }
}
```

## `POST /v1/me/referral/claim`

El invitado usa el código después de registrarse: la app lo guarda al abrir el enlace y lo envía al terminar el registro.

```json
{ "code": "K7M2Q9XA" }
```

**200** `{ "reward": Money }`: el descuento que recibirá en su primera cuota.

| Error                      | HTTP | Cuándo                                                            |
| -------------------------- | ---- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`         | 400  | Formato inválido (se ignoran mayúsculas y espacios).              |
| `REFERRAL_CODE_NOT_FOUND`  | 404  | No existe ese código.                                             |
| `REFERRAL_ALREADY_CLAIMED` | 409  | Ya usó un código: una sola vez por usuario.                       |
| `REFERRAL_NOT_ELIGIBLE`    | 409  | Ya se unió a un círculo: el beneficio es para el primero. **[?]** |
| `OWN_REFERRAL_CODE`        | 422  | Es su propio código.                                              |

## `GET /v1/me/referrals?cursor=<texto>&limit=<entero>`

Saldo e invitados de My Referrals (COPAYNI-52). Los invitados van del más reciente al más antiguo, paginados por cursor (`limit` de 1 a 50, 20 por defecto).

```json
{
  "earned": { "amount": 30000, "currency": "PEN" },
  "redeemed": { "amount": 10000, "currency": "PEN" },
  "balance": { "amount": 20000, "currency": "PEN" },
  "invitees": [
    {
      "displayName": "Ana Q.",
      "status": "first_pay_in_paid",
      "claimedAt": "2026-11-02T15:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

- **Ganado (`earned`):** su propio beneficio si usó un código, más el de cada invitado que ya pagó su primera cuota, hasta el tope (cuentan los primeros en usar su código). Se calcula a partir de los referidos y las cuotas pagadas; no hay un saldo que pueda desfasarse.
- **Canjeado (`redeemed`):** la suma de los descuentos aplicados a sus cuotas (COPAYNI-53). `balance` = ganado − canjeado.
- **Invitados:** el nombre minimizado (nombre e inicial del apellido) o, sin nombre, el email o teléfono enmascarado. `status`: `registered`, `joined_circle` o `first_pay_in_paid`.
- Errores: `VALIDATION_ERROR` (400, `limit` fuera de rango o cursor inválido) y `UNAUTHORIZED`.

## Descuento en la próxima cuota (COPAYNI-53)

El saldo se descuenta solo, sin superar la cuota, al cobrarla: en el débito automático y en el pago desde la app ([payments.md](payments.md)).

- Se cobra la cuota menos el descuento. Si el saldo cubre toda la cuota, no se cobra nada y la cuota queda pagada.
- La cooperativa paga el descuento: el movimiento contable `referral_discount` (de `operator` al pagador) mantiene el registro de doble entrada cuadrado con el dinero real.
- **Asientos:** cada canje queda en `referral_redemptions`, uno por cuota (idempotente) y con el saldo bloqueado, así dos cuotas del mismo usuario no gastan el mismo saldo. Si eso pasara igual, la cooperativa absorbe la diferencia y queda el log `referrals.discount_exceeded_balance`.
- Los créditos se derivan de los referidos: el del invitado al usar el código y el del invitador cuando su invitado paga su primera cuota (también si se descontó del payout).
