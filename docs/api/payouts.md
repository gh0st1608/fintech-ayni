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
- **Datos de la cuenta (D4):** desde COPAYNI-81 los registra el personal en el back-office (ver abajo). Registrar una cuenta fija el método: `bank_transfer` para una cuenta bancaria y `digital_wallet` para Yape o Plin.

## Cuenta de cobro (COPAYNI-81)

**Decisión de negocio (2026-11-12):** la cuenta donde la persona recibe su pozo la registra el personal desde el back-office, con la constancia que envía la persona. La app solo la muestra.

### `GET /v1/me/payout-account`

```json
{
  "account": {
    "id": "6f1c…",
    "kind": "bank_account",
    "label": "BCP •••• 4567",
    "bankCode": "002",
    "bankName": "BCP",
    "accountType": "savings",
    "walletProvider": null,
    "last4": "4567",
    "holderName": "Juana María Torres Pérez",
    "registeredAt": "2026-11-12T15:00:00.000Z"
  }
}
```

`account` es `null` si todavía no hay una. La respuesta **nunca** trae el CCI ni el celular completos.

### Registro en el back-office

`GET` y `PUT /admin/v1/users/:userId/payout-account` ([admin.md](admin.md#cuenta-de-cobro)).

| Campo               | Regla                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `kind`              | `bank_account` o `wallet`                                                                                                           |
| `bankCode`          | Código del banco: `002` BCP, `003` Interbank, `009` Scotiabank, `011` BBVA, `018` Banco de la Nación, `035` Pichincha, `038` BanBif |
| `accountType`       | `savings` o `checking`                                                                                                              |
| `cci`               | 20 dígitos (admite espacios y guiones), con sus dos dígitos de control válidos; los 3 primeros son el banco                         |
| `provider`, `phone` | `yape` o `plin`; celular de 9 dígitos que empieza con 9 (admite `+51`)                                                              |
| `holderName`        | Al menos dos palabras. Debe contener el nombre y el apellido del perfil, sin importar tildes ni mayúsculas                          |
| `reason`            | Obligatorio, hasta 500 caracteres                                                                                                   |

| Error                               | HTTP | Cuándo                                                                                       |
| ----------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                  | 400  | Campo inválido. `details` dice cuál: `cci: invalid`, `cci: bank_mismatch`, `phone: invalid`… |
| `USER_NOT_FOUND`                    | 404  | No existe la persona                                                                         |
| `PAYOUT_ACCOUNT_IDENTITY_REQUIRED`  | 422  | La persona no tiene el DNI aprobado ni la verificación de VerificaID aprobada                |
| `PAYOUT_ACCOUNT_HOLDER_MISMATCH`    | 422  | El titular no es la persona del perfil verificado                                            |
| `PAYOUT_ACCOUNT_CHANGE_NOT_ALLOWED` | 409  | Ya tiene una cuenta y este mes cobra en alguna junta (la regla de R8)                        |
| `PAYOUT_ACCOUNT_CONFLICT`           | 409  | Otra persona del equipo registró una cuenta al mismo tiempo                                  |

### Seguridad y datos

- **Cifrado:** el CCI o el celular se guardan con AES-256-GCM (`FIELD_ENCRYPTION_KEY`, de Secrets Manager); en claro solo quedan los 4 últimos dígitos. Ninguna respuesta descifra el número: lo necesitará el riel de payouts (T5).
- **Historial:** registrar una cuenta marca la anterior como reemplazada; nunca se borran (`payout_accounts`, una sola vigente por persona).
- **Auditoría:** `user.payout_account.view` y `user.payout_account.register` guardan el motivo, el tipo, el banco o la billetera, nunca el número. Los logs registran solo `payouts.account_registered` con `userId`, `kind` y `staffId`.
- **Sin pagos a terceros:** la cuenta debe estar a nombre de la persona y en soles (supuesto aprobado en la historia).

### Por confirmar

- **[verificar] Lista de bancos** con Finanzas, y el algoritmo del dígito de control del CCI contra constancias reales antes de producción.
- **Regla del titular** (provisional): el nombre del perfil tiene que estar contenido en el titular. La valida Legal junto con la de VerificaID.
- **Tipos de Marruecos:** el catálogo de métodos sigue con `prepaid_card` y `fawry`. Reemplazarlos por los de Perú queda pendiente porque toca la unión y la app.
