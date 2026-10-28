# Contrato de API: perfil del usuario

**Estado:** `PATCH /v1/me` implementado en el backend (COPAYNI-50; `apps/backend/src/modules/users`). La app mobile lo usa al cambiar de idioma (`UserProfileApiRepository`).

Usa el contrato común de respuestas descrito en [auth.md](auth.md). Requiere `Authorization: Bearer <accessToken>`.

## `PATCH /v1/me`

```json
{ "preferredLanguage": "en" }
```

- `preferredLanguage`: etiqueta BCP 47 sencilla (`es`, `en`, `pt-BR`). El backend valida el formato; qué idiomas existen lo decide el catálogo de la app.

**200**:

```json
{
  "id": "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f",
  "email": "ana@mail.com",
  "phone": null,
  "status": "active",
  "preferredLanguage": "en"
}
```

| Error              | HTTP | Cuándo                                                       |
| ------------------ | ---- | ------------------------------------------------------------ |
| `VALIDATION_ERROR` | 400  | Falta `preferredLanguage`, formato inválido o campos de más. |
| `UNAUTHORIZED`     | 401  | Sin token o token inválido.                                  |
| `USER_NOT_FOUND`   | 404  | El usuario del token ya no existe.                           |

**Pendiente:** `GET /v1/me` y la edición de la información personal (COPAYNI-44, 45).
