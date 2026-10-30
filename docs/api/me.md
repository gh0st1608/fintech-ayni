# Contrato de API: perfil del usuario

**Estado:** `GET /v1/me` (COPAYNI-44) y `PATCH /v1/me` (COPAYNI-50) implementados en el backend (`apps/backend/src/modules/users`). La app mobile usa el `PATCH` al cambiar de idioma (`UserProfileApiRepository`); la pantalla de Perfil que usa el `GET` está pendiente.

Usa el contrato común de respuestas descrito en [auth.md](auth.md). Requiere `Authorization: Bearer <accessToken>`.

## Modelo `Me`

```json
{
  "id": "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f",
  "email": "ana@mail.com",
  "phone": null,
  "status": "active",
  "preferredLanguage": "en",
  "firstName": "Ana",
  "lastName": "Quispe",
  "fullName": "Ana Quispe",
  "monthlyPayInLimit": { "amount": 500000, "currency": "PEN" }
}
```

| Campo               | Notas                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fullName`          | Nombre y apellido (COPAYNI-45); `null` si no cargó ninguno. Cuando exista el KYC (COPAYNI-47), el nombre del documento podría reemplazarlo **[?]**.                                                                                                              |
| `monthlyPayInLimit` | Límite mensual de pay-in ([Money](circles.md#modelo-money)); `null` si no se le restringe. **Provisional (R5):** el 30 % del ingreso aprobado ([documents.md](documents.md)); sin ingreso aprobado, `JOIN_MONTHLY_PAYIN_LIMIT`. Es el mismo que valida la unión. |

## `GET /v1/me`

Devuelve el modelo `Me` del usuario autenticado. Errores: `UNAUTHORIZED` (401) y `USER_NOT_FOUND` (404).

## `PATCH /v1/me`

```json
{ "firstName": "Ana", "lastName": "Quispe", "preferredLanguage": "en" }
```

Todos los campos son opcionales, pero el cuerpo no puede venir vacío. Un campo ausente no cambia (COPAYNI-45 y 50).

- `preferredLanguage`: etiqueta BCP 47 sencilla (`es`, `en`, `pt-BR`). El backend valida el formato; qué idiomas existen lo decide el catálogo de la app.
- `firstName` y `lastName`: de 1 a 80 caracteres; se recortan los espacios y se rechazan los caracteres de control y `<` `>`.
- El log de auditoría `users.profile_updated` registra qué campos cambiaron, nunca sus valores.
- El email y el teléfono no se cambian aquí: ver abajo.

**200**: el modelo `Me`, con el idioma nuevo.

| Error              | HTTP | Cuándo                                                       |
| ------------------ | ---- | ------------------------------------------------------------ |
| `VALIDATION_ERROR` | 400  | Falta `preferredLanguage`, formato inválido o campos de más. |
| `UNAUTHORIZED`     | 401  | Sin token o token inválido.                                  |
| `USER_NOT_FOUND`   | 404  | El usuario del token ya no existe.                           |

## Cambiar el email o el teléfono: `POST /v1/me/contact/start` y `/verify`

**Supuesto R9 [?]:** cambiar el email o el teléfono exige verificar un OTP enviado al dato **nuevo** (COPAYNI-45). Reutiliza los desafíos OTP de [auth.md](auth.md) y su política (duración, intentos, límite de envíos).

1. `POST /v1/me/contact/start` con `{ "identifier": "nueva@mail.com", "type": "email" }` (o `phone` en E.164) responde un `AuthChallenge` y envía el código al dato nuevo. El dato no cambia todavía. Si es el mismo que ya tiene, responde `VALIDATION_ERROR`.
2. `POST /v1/me/contact/verify` con `{ "challengeId": "…", "code": "1234" }` aplica el cambio y responde el modelo `Me`.

- No dice si el dato ya está en otra cuenta hasta verificarlo: así no revela qué emails o teléfonos están registrados. Al verificar, si otra cuenta lo tiene, responde `CONTACT_TAKEN` (409) y no cambia nada.
- Un desafío ajeno, inexistente o ya usado responde `OTP_EXPIRED`. Los demás errores son los de `/auth/verify` (`OTP_INVALID`, `OTP_ATTEMPTS_EXCEEDED`) y `RATE_LIMITED`.
- Desbloquea guardar tarjetas para quien entró solo con teléfono: Mercado Pago necesita un email (`EMAIL_REQUIRED`, [payments.md](payments.md)).

**Pendiente:** la foto de perfil (¿se puede subir una?, pregunta abierta de COPAYNI-44).
