# Contrato de API: login con Google y Apple

**Estado:** implementado en el backend (`apps/backend/src/modules/auth`, COPAYNI-91), **apagado hasta tener cuentas de proveedor**. Sigue el plan de implementación de COPAYNI-91 v1.0, adaptado a lo que ya existe en el repositorio.

Usa el contrato común de respuestas de [auth.md](auth.md): el login social **no** crea un segundo sistema de sesiones.

## Principio

El proveedor autentica y firma una credencial; Ayni la verifica, resuelve o crea la cuenta y emite **su propia** sesión con el mismo emisor que el OTP (`SessionIssuer`: familias de refresh token, rotación y bloqueo de cuentas incluidos).

**Un token de Google o Apple nunca es la sesión de Ayni.**

La cuenta se resuelve por `provider + sub`, nunca por correo: el correo cambia y Apple puede no volver a entregarlo.

## Qué cambió respecto del plan, y por qué

| Plan                                      | Aquí                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/social/...`                   | `POST /v1/auth/social/...`: todas las rutas de la app van versionadas                                                 |
| Respuesta con `user` y `onboardingRequired` | `{ accessToken, refreshToken }`, el mismo DTO del OTP. El perfil y el onboarding salen de `GET /v1/me`, que ya existe |
| `google-auth-library` y `jose`            | El verificador de JWT con JWKS que ya trae el repositorio (login del personal, COPAYNI-72). Dos dependencias menos    |
| MySQL o DynamoDB                          | PostgreSQL con TypeORM: `UNIQUE (provider, subject)` y una transacción para crear usuario e identidad                 |
| Entidad `User` con email opcional         | `users` exige email **o** teléfono (`ck_users_identifier`); de ahí la regla de alta de abajo                           |

## Alta de cuenta: las tres respuestas posibles

Cuando la identidad **no** existe todavía:

| Situación                                      | Qué pasa                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| El proveedor da un correo verificado y libre   | Se crean usuario (activo) e identidad en una transacción                                                  |
| Ese correo ya es de otra cuenta                | **409 `SOCIAL_EMAIL_TAKEN`**. No se vincula sola: hay que iniciar sesión como siempre y vincular en el perfil |
| El proveedor no da correo verificado           | **400 `VALIDATION_ERROR`**: sin correo no podemos escribirle a la persona, y la base exige email o teléfono |

Un correo que el proveedor no declara verificado se trata como si no hubiera correo.

## Endpoints

| Método y ruta                          | Uso                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `POST /v1/auth/social/google`          | Verifica el ID Token de Google y abre sesión                             |
| `POST /v1/auth/social/apple`           | Igual, con el ID Token del flujo nativo de iOS                           |
| `POST /v1/auth/social/apple/authorize` | Abre el intento web de Android: devuelve la URL de Apple con `state` y `nonce` |
| `POST /v1/auth/social/apple/callback`  | Callback HTTPS de Apple; redirige al deep link con el código interno     |
| `POST /v1/auth/social/apple/exchange`  | La app canjea el código interno por su sesión                            |
| `GET /v1/me/social-identities`         | Proveedores vinculados (requiere sesión)                                 |
| `POST /v1/me/social-identities/{provider}` | Vincula un proveedor a la cuenta con sesión                          |
| `DELETE /v1/me/social-identities/{provider}` | Lo desvincula                                                      |

Cuerpo del login y del vínculo:

```json
{ "idToken": "<JWT del proveedor>", "nonce": "<el nonce de este intento>" }
```

Respuesta: `{ "accessToken": "…", "refreshToken": "…" }`, como `POST /v1/auth/verify`.

### El nonce

**Siempre se exige.** La app genera un valor aleatorio por intento, se lo pasa al SDK del proveedor y manda el mismo valor aquí. El backend acepta que el claim traiga el valor tal cual o su **SHA-256 en hexadecimal**, porque algunos SDK envían el hash al proveedor y conservan el original en el dispositivo; en ambos casos hay que conocer el nonce original, así que un token obtenido en otra sesión no pasa.

En el flujo web de Android el nonce lo genera **el backend** y queda guardado con el intento: el dispositivo no lo elige.

### Flujo web de Apple en Android

1. La app pide `apple/authorize`; el backend guarda `state` y `nonce` y devuelve la URL.
2. La app abre esa URL en el navegador del sistema.
3. Apple responde al callback HTTPS con `form_post`.
4. El backend consume el `state` (**de un solo uso**), verifica el ID Token con el nonce guardado y resuelve la cuenta.
5. Redirige al deep link de la app **con un código interno opaco de un solo uso**, nunca con tokens: un deep link queda en historiales y registros del sistema.
6. La app canjea ese código en `apple/exchange` y recibe su sesión.

Si la persona cancela, Apple avisa y la app vuelve con `?error=cancelled`, sin sesión.

## Errores

| Error                   | HTTP | Cuándo                                                                         |
| ----------------------- | ---- | -------------------------------------------------------------------------------- |
| `UNAUTHORIZED`          | 401  | Firma, emisor, audiencia, vigencia o nonce que no cuadran; `state` o código interno inexistente, ya usado o vencido |
| `VALIDATION_ERROR`      | 400  | Cuerpo inválido, o sin correo verificado para abrir la cuenta                     |
| `SOCIAL_EMAIL_TAKEN`    | 409  | Ese correo ya es de otra cuenta                                                   |
| `SOCIAL_IDENTITY_TAKEN` | 409  | Esa cuenta del proveedor ya está vinculada a otra persona                         |
| `NOT_FOUND`             | 404  | Proveedor desconocido, o desvincular algo que no estaba vinculado                 |
| `SERVICE_UNAVAILABLE`   | 503  | El proveedor no está configurado en este ambiente                                 |

El motivo exacto del rechazo de un token **nunca** sale en la respuesta: queda en el log (`reason`), para no ayudar a quien lo intenta.

## Configuración

| Variable                  | Para qué                                                                 |
| ------------------------- | ------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_IDS`       | Client id de Android, iOS y Web separados por coma: la lista cerrada de audiencias |
| `APPLE_CLIENT_IDS`        | Bundle id de iOS y Services ID del flujo web                              |
| `APPLE_SERVICE_ID`        | Services ID del flujo web de Android                                      |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID` | Identifican la clave de Sign in with Apple                          |
| `APPLE_PRIVATE_KEY`       | La clave `.p8` en PEM. **Secreto**: Secrets Manager, nunca el repositorio ni `EXPO_PUBLIC_` |
| `APPLE_REDIRECT_URI`      | Callback HTTPS registrado en Apple                                        |
| `SOCIAL_APP_REDIRECT_URI` | Deep link por el que la app recibe el código interno                      |
| `SOCIAL_FLOW_TTL_SECONDS` | Cuánto vive un intento del flujo web (10 min por defecto)                 |

**Una lista de client id vacía apaga ese proveedor** y su endpoint responde 503. Por eso esto se puede desplegar antes de tener las cuentas: sin configuración, el login social simplemente no se ofrece.

## Pendiente [?]

- **Cuentas de proveedor:** proyecto de Google Cloud con los tres client id, y membresía de Apple Developer con App ID, Services ID, clave `.p8` y dominio del callback verificado. Hasta entonces no se puede probar contra los proveedores reales (QA-01, QA-02 y QA-03).
- **Dominio del callback:** `APPLE_REDIRECT_URI` necesita el dominio público de la API, que depende del despliegue (COPAYNI-12).
- **Limpieza de intentos vencidos:** `social_auth_flows` guarda los intentos; conviene borrar los vencidos en la tarea diaria cuando el volumen lo justifique.
- **App:** los SDK, la configuración nativa y los botones son la otra mitad de la historia.
