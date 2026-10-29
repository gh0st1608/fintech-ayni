# Contrato de API: círculos (propuesta)

**Estado:** `GET /v1/circles/join-config` está **implementado en el backend** (COPAYNI-8; `apps/backend/src/modules/circles`), con los montos tomados de la configuración validada.

- La app mobile ya la consume:
  - `JoinConfigApiRepository` usa el backend real.
  - `InMemoryJoinConfigRepository` es el adaptador falso de dev (`EXPO_PUBLIC_CIRCLES_API=fake`).
- Requiere un access token del módulo auth (COPAYNI-19, 20 y 21; [auth.md](auth.md)).
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

| Error                | HTTP | Cuándo                                                          |
| -------------------- | ---- | --------------------------------------------------------------- |
| `VALIDATION_ERROR`   | 400  | Falta `payoutAmount`, no es un entero o hay parámetros de más.  |
| `PAYOUT_NOT_ALLOWED` | 422  | Fuera del rango, fuera del salto o sobre el límite del usuario. |

## `GET /v1/circles/slots?payoutAmount=<entero>&months=<entero>`

**Estado:** implementado en el backend (COPAYNI-30), con una **regla provisional** para elegir el círculo (R2). La app la consume con `CircleQuoteApiRepository` y, en dev, con el adaptador falso.

Slots del círculo que se le ofrece al usuario con ese payout y esa duración, ocupados incluidos, con el precio que calcula `SlotPricing` (COPAYNI-24).

- `payoutAmount` y `months` tienen que ser una combinación de `installment-options`.

### Qué círculo se ofrece (regla provisional, pending-scope R2)

Se configura con `CIRCLE_ASSIGNMENT_STRATEGY`:

| Estrategia              | Círculo ofrecido                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill_oldest` (defecto) | El círculo abierto **más antiguo** con el mismo payout, moneda y duración, que **todavía no empezó**, que **no está lleno** y donde el usuario **no es miembro**. Si no hay, uno nuevo. |
| `always_new`            | Siempre uno nuevo.                                                                                                                                                                      |

Por qué es coherente con el dominio:

- **Completar antes de abrir:** un círculo empieza a pagar cuando tiene a sus miembros. Llenar primero el más antiguo hace que arranque antes, en lugar de repartir a los usuarios entre muchos círculos a medio llenar.
- **Solo círculos que no empezaron:** el slot 1 cobra el primer mes; en un círculo ya iniciado ese cobro pasó y el cronograma no cuadra.
- **Uno por usuario:** el agregado `Circle` ya impide que un usuario tenga dos slots en el mismo círculo, así que no se le ofrece uno donde ya está.
- **Círculo nuevo:** empieza `CIRCLE_START_OFFSET_MONTHS` meses después del mes actual (1 por defecto). El mes actual se calcula en `BUSINESS_TIME_ZONE` (America/Lima por defecto). El círculo se crea al unirse el primer miembro (COPAYNI-31), no al consultar.

Queda abierto en R2: si los círculos los arma un administrador, el tamaño máximo y qué pasa si no se llenan antes de su fecha de inicio.

**200**:

```json
{
  "circleId": null,
  "startsOn": "2026-11",
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

| Campo          | Notas                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| `circleId`     | Círculo ofrecido; `null` si es uno nuevo. Se envía igual a `POST /join`.       |
| `startsOn`     | Mes de inicio del círculo (`YYYY-MM`).                                         |
| `position`     | 1 = cobra el primer mes. Un slot por mes del círculo.                          |
| `payoutPeriod` | Mes de cobro en formato `YYYY-MM`.                                             |
| `type`         | `fastest_payout`, `lowest_fees` o `highest_return` (`SLOT_TYPES` del dominio). |
| `fee`          | Fee por cobrar antes; cero salvo en `fastest_payout`.                          |
| `discount`     | Descuento en los pay-ins por cobrar al final; cero salvo en `highest_return`.  |
| `available`    | `false` si otro miembro ya ocupa el slot. La app lo muestra deshabilitado.     |

Comportamiento de la app:

- Agrupa los slots por tipo, en el orden de `SLOT_TYPES`.
- Antes de continuar, vuelve a pedir la lista y comprueba que el slot elegido siga libre. Si se ocupó, avisa, refresca la lista y quita la selección.
- Esa comprobación no reserva el slot: la reserva atómica es la unión al círculo (COPAYNI-31), con la unicidad por (círculo, slot) del repositorio.

Errores: los mismos que `installment-options`, más `VALIDATION_ERROR` si `months` no es una duración ofrecida para ese payout.

## `POST /v1/circles/join`

**Estado:** implementado en el backend (COPAYNI-31), con **reglas de elegibilidad provisionales y configurables**: el KYC (COPAYNI-47) y el límite mensual (R5) todavía no existen. No hay diseño de la pantalla de confirmación (D2).

Confirma la unión al círculo que ofreció `slots` y reserva el slot de forma **atómica e idempotente**.

Cabeceras:

- `Authorization: Bearer <accessToken>`.
- `Idempotency-Key`: de 16 a 255 caracteres `[A-Za-z0-9_-]`. La app genera una (un UUID) por borrador y la repite en cada reintento.

```json
{ "circleId": null, "payoutAmount": 3000000, "months": 10, "position": 3 }
```

| Campo                     | Notas                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `circleId`                | El `circleId` de `slots`. `null` abre el círculo nuevo que ofreció `slots`, con el mismo mes de inicio.    |
| `payoutAmount` / `months` | La combinación de `installment-options`. Si hay `circleId`, tienen que ser las condiciones de ese círculo. |
| `position`                | El slot elegido.                                                                                           |

**201** (unión creada) o **200** (reintento con la misma clave: la unión ya existía):

```json
{
  "circleId": "6f1c…",
  "startsOn": "2026-11",
  "payout": { "amount": 3000000, "currency": "PEN" },
  "months": 10,
  "position": 3,
  "payoutPeriod": "2027-01",
  "type": "lowest_fees",
  "installments": [{ "amount": 336000, "currency": "PEN" }, "…"],
  "netPayout": { "amount": 3000000, "currency": "PEN" },
  "created": true
}
```

- `installments` trae una cuota por mes, en orden; la app la usa como resumen confirmado.
- `created: false` indica un reintento. La app lo trata como éxito.

### Idempotencia y concurrencia

- **Reintento con la misma clave y los mismos datos:** responde la unión ya hecha, aunque la elegibilidad haya cambiado desde entonces.
- **La misma clave con otro slot, otro payout u otro círculo:** responde `IDEMPOTENCY_KEY_REUSED`.
- **Clave única por usuario en todos sus círculos** (índice `uq_circle_memberships_user_idempotency_key`): el mismo pedido enviado dos veces a la vez con `circleId: null` abre un solo círculo.
- **Dos usuarios por el mismo slot:** uno lo obtiene; el otro recibe `SLOT_TAKEN` y la app vuelve al paso 3.
- **Dos usuarios que piden un círculo nuevo a la vez:** cada uno abre el suyo. Con `fill_oldest` (R2), los siguientes llenan primero el más antiguo.
- **Si la unión se rechaza** (por elegibilidad, validación o slot ocupado), no se guarda nada y la misma clave sirve para volver a intentar.

### Elegibilidad (provisional)

Se comprueba en este orden, que es el orden en que la app resuelve cada caso:

| Requisito                                   | Regla provisional                                                                                                                                                        | Error                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| National ID válido ("Central Bank")         | `JOIN_IDENTITY_CHECK`: `assume_verified` (defecto) deja unirse a todos; `assume_unverified` los trata como no verificados, para probar la redirección. Hasta COPAYNI-47. | `NATIONAL_ID_REQUIRED`         |
| Cuota bajo el límite mensual de pay-in (R5) | `JOIN_MONTHLY_PAYIN_LIMIT`, en unidades menores; 0 (defecto) = sin límite. Se compara con cada cuota del slot, sin sumar las de otros círculos.                          | `MONTHLY_LIMIT_EXCEEDED`       |
| Método de cobro elegido (COPAYNI-37)        | El método guardado tiene que seguir disponible en el catálogo.                                                                                                           | `PAYOUT_METHOD_REQUIRED`       |
| Payout dentro del límite del método         | Por ejemplo, la tarjeta prepago (`PAYOUT_PREPAID_CARD_LIMIT`).                                                                                                           | `PAYOUT_METHOD_LIMIT_EXCEEDED` |

Cada unión queda registrada en el log como `circles.joined`, con el usuario, el círculo, el slot y si abrió un círculo nuevo.

### Errores

| Error                    | HTTP | Cuándo                                                                                                                                         |
| ------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Cuerpo inválido; `Idempotency-Key` ausente o inválida; `months: not_offered`; `circleId: terms_mismatch` (el círculo tiene otras condiciones). |
| `CIRCLE_NOT_FOUND`       | 404  | El `circleId` no existe.                                                                                                                       |
| `SLOT_TAKEN`             | 409  | Otro miembro tomó el slot.                                                                                                                     |
| `ALREADY_MEMBER`         | 409  | El usuario ya tiene un slot en ese círculo.                                                                                                    |
| `CIRCLE_ALREADY_STARTED` | 409  | El círculo empezó: el cobro de los primeros slots ya pasó.                                                                                     |
| `IDEMPOTENCY_KEY_REUSED` | 409  | La clave ya se usó con otros datos.                                                                                                            |
| `PAYOUT_NOT_ALLOWED`     | 422  | Payout fuera del rango, del salto o del límite del usuario.                                                                                    |
| `SLOT_OUT_OF_RANGE`      | 422  | `position` mayor que la duración.                                                                                                              |
| Elegibilidad             | 422  | `NATIONAL_ID_REQUIRED`, `MONTHLY_LIMIT_EXCEEDED`, `PAYOUT_METHOD_REQUIRED`, `PAYOUT_METHOD_LIMIT_EXCEEDED`.                                    |

Fuera de alcance, pendientes del diseño o del PO: la firma del contrato y del pagaré (D3, T9) y el primer pago (D1).

## `GET /v1/circles/recommended`

**Estado:** implementado en el backend (COPAYNI-25), con un **criterio provisional**. La app lo usa en Home ("Recomendados para ti") y en el estado vacío de Circles > Activos.

Criterio (coherente con la asignación `fill_oldest`, R2; pendiente con el PO):

- **Admiten al usuario:** no empezaron, no están llenos y el usuario no es miembro.
- **El usuario puede elegir sus condiciones hoy:** el payout está permitido en `join-config` y la duración se ofrece en `installment-options`.
- **Orden:** del más antiguo al más nuevo, porque completarlos hace que empiecen antes.
- **Cantidad:** hasta `RECOMMENDED_CIRCLES_LIMIT` círculos (5 por defecto).

**200**:

```json
{
  "items": [
    {
      "circleId": "6f1c…",
      "payout": { "amount": 3000000, "currency": "PEN" },
      "months": 10,
      "startsOn": "2026-11",
      "endsOn": "2027-08",
      "baseInstallment": { "amount": 300000, "currency": "PEN" },
      "adminFee": { "amount": 360000, "currency": "PEN" },
      "availableSlots": 7
    }
  ]
}
```

- `baseInstallment` es payout / meses; la cuota real depende del slot que se elija.
- **Sin círculos abiertos**, `items` viene vacío y la app oculta la sección.
- **"Join now"** entra al flujo de unión con ese payout. `slots` ofrece el mismo círculo mientras siga siendo el más antiguo con esas condiciones.

## `GET /v1/me/circles?status=active|finished&cursor=<texto>&limit=<entero>`

**Estado:** implementado en el backend (COPAYNI-26).

Mis círculos, de la unión más reciente a la más antigua, paginados por cursor.

| Parámetro | Notas                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`  | Obligatorio. `active`: el círculo todavía no terminó, **incluidos los que no empezaron**. `finished`: su último mes ya pasó (mes actual en `BUSINESS_TIME_ZONE`). |
| `cursor`  | El `nextCursor` de la página anterior. Es opaco: la app no lo interpreta.                                                                                         |
| `limit`   | De 1 a 50; 20 por defecto.                                                                                                                                        |

**200**:

```json
{
  "items": [
    {
      "circleId": "6f1c…",
      "status": "active",
      "payout": { "amount": 3000000, "currency": "PEN" },
      "months": 10,
      "startsOn": "2026-11",
      "endsOn": "2027-08",
      "position": 3,
      "payoutPeriod": "2027-01",
      "type": "lowest_fees",
      "installments": [{ "amount": 336000, "currency": "PEN" }, "…"],
      "adminFee": { "amount": 360000, "currency": "PEN" },
      "netPayout": { "amount": 3000000, "currency": "PEN" },
      "joinedAt": "2026-10-28T23:10:00.000Z"
    }
  ],
  "nextCursor": "WyIyMDI2LTEw…"
}
```

- `endsOn` es el mes del último cobro. `installments` y `adminFee` son los del slot del usuario.
- **Supuesto provisional (R1 y R4):** el precio se recalcula con la configuración actual, porque todavía no se guarda con la membresía al unirse. Si cambian las variables `SLOT_*` o `ADMIN_FEE_*`, cambia también el precio de las uniones anteriores.
- `nextCursor: null` indica que no hay más páginas. El orden es estable aunque dos uniones tengan la misma fecha (se desempata por id).

| Error              | HTTP | Cuándo                                                                                                |
| ------------------ | ---- | ----------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR` | 400  | `status` ausente o inválido, `limit` fuera de rango, o `cursor` inválido (`details.cursor: invalid`). |

## Valores pendientes (pending-scope M6, R5 y R15)

El adaptador falso usa los valores del Figma como provisionales:

- Payout de 3.000 a 120.000 en saltos de 500.
- Ahorro de hasta 1.000.000.
- Sin límite del usuario (se puede simular con la opción `userPayoutLimit`).
- Slots con los mismos parámetros provisionales que el backend (R1, variables `SLOT_*` y `ADMIN_FEE_*`): 25 % Fastest con fee de hasta el 10 % del payout, 25 % Highest con descuento de hasta el 5 %, y el círculo empieza el mes siguiente. Las opciones `takenPositions` y `take(position)` simulan slots ocupados.
