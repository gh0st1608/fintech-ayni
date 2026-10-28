# Contrato de API: métodos de cobro

**Estado:** implementado en el backend (COPAYNI-37; `apps/backend/src/modules/payouts`) con un **catálogo provisional**. La app lo consume en el paso 4 del flujo de unión (`PayoutMethodApiRepository`) y, en dev, con un adaptador falso.

Usa el contrato común de respuestas descrito en [auth.md](auth.md). Requiere `Authorization: Bearer <accessToken>`.

## Modelo `PayoutMethods`

```json
{
  "methods": [
    {
      "type": "digital_wallet",
      "available": true,
      "badges": [],
      "limit": null
    },
    {
      "type": "prepaid_card",
      "available": true,
      "badges": ["no_charge"],
      "limit": { "amount": 10000000, "currency": "PEN" }
    },
    {
      "type": "bank_transfer",
      "available": true,
      "badges": ["no_charge"],
      "limit": null
    }
  ],
  "selected": null
}
```

| Campo                 | Notas                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| `methods[].type`      | `digital_wallet`, `prepaid_card`, `bank_transfer` o `fawry`, en el orden a mostrar. |
| `methods[].available` | `false`: la app lo muestra deshabilitado con "No disponible" y no se puede elegir.  |
| `methods[].badges`    | Por ahora solo `no_charge` ("Sin costo").                                           |
| `methods[].limit`     | Máximo por payout (la tarjeta prepago), o `null`.                                   |
| `selected`            | Método elegido, o `null`. La app lo preselecciona.                                  |

## `GET /v1/me/payout-method`

**200** → `PayoutMethods`.

## `PUT /v1/me/payout-method`

```json
{ "method": "bank_transfer" }
```

**200** → `PayoutMethods` con el nuevo `selected`.

| Error                              | HTTP | Cuándo                                                                       |
| ---------------------------------- | ---- | ---------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                 | 400  | Falta `method` o no es texto.                                                |
| `PAYOUT_METHOD_NOT_AVAILABLE`      | 422  | No está en el catálogo o está deshabilitado.                                 |
| `PAYOUT_METHOD_CHANGE_NOT_ALLOWED` | 422  | El usuario cobra este mes en alguno de sus círculos (regla provisional, R8). |

## Supuestos provisionales

- **Catálogo (pending-scope T5):** los tipos del Figma (Payout Method, 55:9520), configurables con `PAYOUT_METHODS`, `PAYOUT_METHODS_UNAVAILABLE`, `PAYOUT_METHODS_NO_CHARGE` y `PAYOUT_PREPAID_CARD_LIMIT`. Fawry es un medio egipcio y queda fuera por defecto; los proveedores locales (bancos, wallets como Yape o Plin) están por definir.
- **Cambio de método (R8):** el Figma dice "solo antes del mes de payout". Se rechaza el cambio durante un mes en que el usuario cobra, porque ese payout ya se procesa con el método anterior. Elegir el mismo método siempre se acepta.
- **Datos de la cuenta (D4):** solo se guarda el tipo. Los datos de la cuenta o wallet llegan con la pantalla "Add Account", que no tiene diseño.
