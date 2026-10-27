# Contrato de API: autenticación sin contraseña (propuesta)

**Estado:** propuesta _contract-first_ para COPAYNI-19, COPAYNI-20 y COPAYNI-21.

- La app mobile ya la consume:
  - `AuthApiRepository` usa el backend real.
  - `InMemoryAuthApi` es el adaptador falso de dev.
- El backend (COPAYNI-8) debe confirmarla o ajustarla antes de implementar los endpoints.

Todas las respuestas usan el contrato común del backend:

```json
{ "success": true,  "data": { ... },                                        "traceId": "..." }
{ "success": false, "error": { "code": "...", "message": "...", "details": { ... } }, "traceId": "..." }
```

Base: `/v1`. Las fechas van en ISO 8601 con zona horaria.

## Modelo `AuthChallenge`

| Campo               | Tipo                 | Notas                                                                             |
| ------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `challengeId`       | string               | Identificador opaco del desafío. No revela al usuario.                            |
| `channel`           | `"email"` \| `"sms"` | Canal por el que se envió el código.                                              |
| `maskedDestination` | string               | Destino enmascarado por el backend, p. ej. `a***@mail.com` o `+51 ••• ••• 321`.   |
| `expiresAt`         | datetime             | Vencimiento del código actual.                                                    |
| `resendAvailableAt` | datetime             | A partir de cuándo se permite `resend`. La app calcula el contador con este dato. |

## `POST /v1/auth/start`

Envía un OTP de 4 dígitos. Si el usuario no existe, lo crea en estado pendiente de verificación.

```json
{ "identifier": "ana@mail.com", "type": "email" }
{ "identifier": "+51987654321", "type": "phone" }
```

- El email llega normalizado en minúsculas.
- El teléfono llega en formato E.164.
- La app valida el formato antes de enviar, pero el backend debe volver a validarlo.

**200** → `AuthChallenge`.

| HTTP | `error.code`       | Caso                                                                                                   |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR` | Formato inválido (`details.identifier`).                                                               |
| 429  | `RATE_LIMITED`     | Límite por identificador o IP. **Cabecera `Retry-After` en segundos** (la app muestra cuánto esperar). |

Seguridad:

- La respuesta es idéntica exista o no el usuario.
- El OTP se guarda con hash y expiración.
- Nunca se registra el código ni el identificador completo en los logs.

## `POST /v1/auth/verify`

```json
{ "challengeId": "ch-1", "code": "1234" }
```

**200** → `{ "accessToken": "...", "refreshToken": "..." }`.

- El access token es un JWT de vida corta.
- El refresh token es rotativo (ver COPAYNI-21).

| HTTP | `error.code`            | `details`                      | Caso                                           |
| ---- | ----------------------- | ------------------------------ | ---------------------------------------------- |
| 422  | `OTP_INVALID`           | `{ "attemptsRemaining": "2" }` | Código incorrecto.                             |
| 422  | `OTP_EXPIRED`           | —                              | Código vencido o desafío inexistente.          |
| 422  | `OTP_ATTEMPTS_EXCEEDED` | —                              | Intentos agotados: el código queda invalidado. |

La comparación del código debe hacerse en tiempo constante.

## `POST /v1/auth/resend`

```json
{ "challengeId": "ch-1" }
```

**200** → `AuthChallenge` (mismo `challengeId`).

- Se invalida el código anterior.
- Se reinician los intentos y los plazos.

| HTTP | `error.code`   | Caso                                                                                     |
| ---- | -------------- | ---------------------------------------------------------------------------------------- |
| 429  | `RATE_LIMITED` | Antes de `resendAvailableAt` o por superar el máximo de reenvíos. Incluye `Retry-After`. |
| 404  | `NOT_FOUND`    | Desafío inexistente.                                                                     |

## `POST /v1/auth/refresh`

```json
{ "refreshToken": "..." }
```

**200** → `{ "accessToken": "...", "refreshToken": "..." }`.

- Rotación obligatoria: el refresh token recibido queda invalidado.
- Si se reutiliza un refresh token ya rotado (posible robo), el backend revoca toda la familia de sesiones.

| HTTP | `error.code`   | Caso                                           |
| ---- | -------------- | ---------------------------------------------- |
| 401  | `UNAUTHORIZED` | Refresh token vencido, revocado o reutilizado. |

Comportamiento de la app (COPAYNI-21):

- Una sola renovación en vuelo aunque varias peticiones reciban 401 a la vez.
- Cada petición se reintenta una sola vez.
- Un 401 de este endpoint nunca dispara otra renovación: borra los tokens y la sesión pasa a `sessionExpired`.

## `POST /v1/auth/logout`

```json
{ "refreshToken": "..." }
```

**204** o **200**. Revoca el refresh token.

- Debe ser idempotente: un token ya revocado o desconocido también responde éxito.
- No requiere `Authorization`: la app borra la sesión local antes de llamar y no espera la respuesta.

## Diferencias con la descripción original de Jira

- `verify` y `resend` reciben el `challengeId` en lugar del identificador. Así:
  - el email o teléfono no viaja de nuevo;
  - el backend ata el código a un desafío concreto.

## Valores pendientes (pending-scope R10)

Duración del código, del contador de reenvío, máximo de intentos y máximo de reenvíos.

El adaptador falso usa estos valores provisionales:

- Código: 300 s.
- Reenvío: 30 s.
- 5 intentos.
- Código de prueba `1234`.
