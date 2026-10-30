# Contrato de API: referidos

**Estado:** implementado en el backend (`apps/backend/src/modules/referrals`). Las pantallas de mobile están pendientes del diseño (Figma bloqueado hasta noviembre).

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
