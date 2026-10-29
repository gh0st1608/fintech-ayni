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
  "fullName": null,
  "monthlyPayInLimit": { "amount": 500000, "currency": "PEN" }
}
```

| Campo               | Notas                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fullName`          | `null` hasta capturar la información personal (COPAYNI-45) o el KYC (COPAYNI-47).                                                                                                                                                                      |
| `monthlyPayInLimit` | Límite mensual de pay-in ([Money](circles.md#modelo-money)); `null` si no se le restringe. **Provisional (R5):** es `JOIN_MONTHLY_PAYIN_LIMIT`, igual para todos y el mismo que valida la unión, hasta definir la fórmula con el ingreso (COPAYNI-48). |

## `GET /v1/me`

Devuelve el modelo `Me` del usuario autenticado. Errores: `UNAUTHORIZED` (401) y `USER_NOT_FOUND` (404).

## `PATCH /v1/me`

```json
{ "preferredLanguage": "en" }
```

- `preferredLanguage`: etiqueta BCP 47 sencilla (`es`, `en`, `pt-BR`). El backend valida el formato; qué idiomas existen lo decide el catálogo de la app.

**200**: el modelo `Me`, con el idioma nuevo.

| Error              | HTTP | Cuándo                                                       |
| ------------------ | ---- | ------------------------------------------------------------ |
| `VALIDATION_ERROR` | 400  | Falta `preferredLanguage`, formato inválido o campos de más. |
| `UNAUTHORIZED`     | 401  | Sin token o token inválido.                                  |
| `USER_NOT_FOUND`   | 404  | El usuario del token ya no existe.                           |

**Pendiente:** la edición de la información personal y la foto de perfil (COPAYNI-45; ¿se puede subir una foto?, pregunta abierta de COPAYNI-44).
