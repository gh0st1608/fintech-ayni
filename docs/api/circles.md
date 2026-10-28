# Contrato de API: círculos (propuesta)

**Estado:** `GET /v1/circles/join-config` está **implementado en el backend** (COPAYNI-8; `apps/backend/src/modules/circles`), con los montos tomados de la configuración validada.

- La app mobile ya la consume:
  - `JoinConfigApiRepository` usa el backend real.
  - `InMemoryJoinConfigRepository` es el adaptador falso de dev (`EXPO_PUBLIC_CIRCLES_API=fake`).
- Hasta que exista el módulo auth (COPAYNI-19, 20), el backend responde `401` a cualquier token: la app debe seguir usando el adaptador falso.
- Los montos pasarán a la base de datos con el modelo de círculos (COPAYNI-24).

Usa el contrato común de respuestas descrito en [auth.md](auth.md). Requiere `Authorization: Bearer <accessToken>`.

## Modelo `Money`

```json
{ "amount": 300000, "currency": "PEN" }
```

- `amount`: entero en **unidades menores** (céntimos). 300000 = 3.000,00.
- `currency`: código ISO 4217. La app nunca asume la moneda.

## `GET /v1/circles/join-config`

Montos permitidos para unirse a un Game'ya o al programa de ahorro.

**200**:

```json
{
  "payout": {
    "min": { "amount": 300000, "currency": "PEN" },
    "max": { "amount": 12000000, "currency": "PEN" },
    "step": { "amount": 50000, "currency": "PEN" }
  },
  "userPayoutLimit": { "amount": 2000000, "currency": "PEN" },
  "savingProgramMax": { "amount": 100000000, "currency": "PEN" }
}
```

| Campo              | Notas                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `payout`           | Rango general del slider de Payout Amount. Los saltos se cuentan desde `min`; los tres montos en la misma moneda. |
| `userPayoutLimit`  | Payout máximo según el límite mensual del usuario (R5), o `null` si no lo restringe.                              |
| `savingProgramMax` | Máximo del programa de ahorro, para la descripción de "Elige un servicio".                                        |

Comportamiento de la app:

- Si `userPayoutLimit` es menor que `payout.max`, el slider se corta en ese monto (ajustado al salto) y se explica cómo aumentarlo.
- Si es menor que `payout.min`, no se ofrece el slider: el usuario aún no puede unirse.
- Una respuesta que no cumple el esquema se rechaza (`INVALID_RESPONSE`).

## `GET /v1/circles/installment-options?payoutAmount=<entero>`

Cuotas y duraciones posibles para el payout elegido (Monthly Pay-in, COPAYNI-29). Implementado en el backend (COPAYNI-24).

- `payoutAmount`: en unidades menores. Tiene que estar en el rango de `join-config`, caer en un salto del slider y no superar `userPayoutLimit`.
- Las duraciones salen de la configuración (`CIRCLE_DURATION_OPTIONS`; provisional: 6, 10 y 12 meses, como en el Figma).
- Solo se ofrecen las duraciones que dan cuotas exactas en céntimos.

**200**:

```json
{
  "payout": { "amount": 3000000, "currency": "PEN" },
  "options": [
    { "months": 6, "installment": { "amount": 500000, "currency": "PEN" } },
    { "months": 10, "installment": { "amount": 300000, "currency": "PEN" } },
    { "months": 12, "installment": { "amount": 250000, "currency": "PEN" } }
  ]
}
```

- `installment` es la **cuota base** (payout / meses). La del slot elegido varía con su fee, su descuento y las Admin Fees: es el aviso de la pantalla.
- `options` va de menor a mayor duración y puede venir vacío si ninguna duración da cuotas exactas.
- **Propuesto (R5, no implementado en el backend):** `withinMonthlyLimit` (boolean, opcional) en cada opción. Con `false`, la cuota supera el límite mensual de pay-in del usuario y la app la muestra deshabilitada con el motivo (COPAYNI-29). Si falta, la app no restringe la opción.

| Error                | HTTP | Cuándo                                                         |
| -------------------- | ---- | -------------------------------------------------------------- |
| `VALIDATION_ERROR`   | 400  | Falta `payoutAmount`, no es un entero o hay parámetros de más. |
| `PAYOUT_NOT_ALLOWED` | 422  | Fuera del rango, fuera del salto o sobre el límite del usuario. |

## `GET /v1/circles/slots?payoutAmount=<entero>&months=<entero>` (propuesta)

**Estado:** propuesta _contract-first_ para COPAYNI-30. **No está implementada en el backend.** La app la consume con `CircleQuoteApiRepository` y, en dev, con el adaptador falso.

Slots de un círculo con ese payout y esa duración, ocupados incluidos, con el precio que calcula `SlotPricing` (COPAYNI-24).

- `payoutAmount` y `months` tienen que ser una combinación de `installment-options`.
- **Pendiente (R2):** cómo se elige el círculo cuyos slots se muestran (uno existente con lugares libres o uno nuevo).

**200**:

```json
{
  "payout": { "amount": 3000000, "currency": "PEN" },
  "months": 10,
  "slots": [
    {
      "position": 1,
      "payoutPeriod": "2026-11",
      "type": "fastest_payout",
      "fee": { "amount": 300000, "currency": "PEN" },
      "discount": { "amount": 0, "currency": "PEN" },
      "available": false
    }
  ]
}
```

| Campo          | Notas                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| `position`     | 1 = cobra el primer mes. Un slot por mes del círculo.                                  |
| `payoutPeriod` | Mes de cobro en formato `YYYY-MM`.                                                     |
| `type`         | `fastest_payout`, `lowest_fees` o `highest_return` (`SLOT_TYPES` del dominio).         |
| `fee`          | Fee por cobrar antes; cero salvo en `fastest_payout`.                                  |
| `discount`     | Descuento en los pay-ins por cobrar al final; cero salvo en `highest_return`.          |
| `available`    | `false` si otro miembro ya ocupa el slot. La app lo muestra deshabilitado.             |

Comportamiento de la app:

- Agrupa los slots por tipo, en el orden de `SLOT_TYPES`.
- Antes de continuar, vuelve a pedir la lista y comprueba que el slot elegido siga libre. Si se ocupó, avisa, refresca la lista y quita la selección.
- Esa comprobación no reserva el slot: la reserva atómica es la unión al círculo (COPAYNI-31), con la unicidad por (círculo, slot) del repositorio.

Errores: los mismos que `installment-options`, más `VALIDATION_ERROR` si `months` no es una duración ofrecida para ese payout.

## Valores pendientes (pending-scope M6, R5 y R15)

El adaptador falso usa los valores del Figma como provisionales:

- Payout de 3.000 a 120.000 en saltos de 500.
- Ahorro de hasta 1.000.000.
- Sin límite del usuario (se puede simular con la opción `userPayoutLimit`).
- Slots con los parámetros de las pruebas del backend (R1): 25 % Fastest con fee de hasta el 10 % del payout, 25 % Highest con descuento de hasta el 5 %, y el círculo empieza el mes siguiente. Las opciones `takenPositions` y `take(position)` simulan slots ocupados.
