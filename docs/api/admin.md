# API de administración (back-office)

Endpoints `/admin/v1` para el personal interno ([backoffice-plan.md](../backoffice-plan.md)). No usan el token de la app: usan el **token del personal**, con otro emisor, otra audiencia y otras claves. No deben publicarse en el ALB público (BO8).

## Identidad del personal

`STAFF_AUTH_PROVIDER` define cómo se valida el token:

| Valor          | Uso                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `unconfigured` | Por defecto. Rechaza toda la API de administración con 401                                                                     |
| `oidc`         | Proveedor OIDC con MFA, recomendado Amazon Cognito (BO2). Valida firma RS256 o ES256 con su JWKS, emisor, audiencia y vigencia |
| `dev`          | Solo local. `POST /admin/v1/dev/sessions` emite tokens con el rol pedido. **Prohibido en production**: la API no arranca       |

Con `oidc`:

| Variable                 | Valor                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `STAFF_OIDC_ISSUER`      | Emisor, p. ej. `https://cognito-idp.us-east-1.amazonaws.com/<user-pool-id>`               |
| `STAFF_OIDC_AUDIENCE`    | Client id de la app del back-office. Se compara con `aud` o, si no viene, con `client_id` |
| `STAFF_OIDC_JWKS_URL`    | Opcional. Por defecto `<issuer>/.well-known/jwks.json`, la ruta de Cognito                |
| `STAFF_OIDC_ROLES_CLAIM` | Claim con los roles; por defecto `cognito:groups`. Los grupos que no son roles se ignoran |

- **Step-up:** las acciones críticas exigen `auth_time` de hace menos de `STAFF_STEP_UP_MAX_AGE_SECONDS` (300 s). Sin `auth_time`, se usa `iat`.
- **Claves:** se reutilizan 10 minutos. Un `kid` desconocido (rotación) vuelve a descargarlas, como mucho cada 30 segundos. Si la descarga falla, se conservan las anteriores.
- **Roles:** `support`, `operations`, `finance`, `admin` y `super_admin` ([matriz](../backoffice-plan.md#5-roles-y-permisos)).

## Endpoints

| Método y ruta                                 | Roles                                             | Respuesta                                     |
| --------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `GET /admin/v1/me`                            | Todos                                             | `{ staffId, email, roles, authenticatedAt }`  |
| `POST /admin/v1/dev/sessions`                 | — (solo con `dev`)                                | `{ accessToken, expiresIn }`                  |
| `GET /admin/v1/circles?state=&limit=&cursor=` | `support`, `operations`, `finance`, `super_admin` | `{ items, nextCursor }`                       |
| `GET /admin/v1/circles/:circleId`             | `support`, `operations`, `finance`, `super_admin` | Detalle                                       |
| `POST /admin/v1/circles/:circleId/pause`      | `super_admin`, con step-up                        | Ver [circles.md](circles.md#pausa-copayni-61) |
| `POST /admin/v1/circles/:circleId/resume`     | `super_admin`, con step-up                        | Igual                                         |

- `POST /admin/v1/dev/sessions` recibe `{ email, roles }`. Sin el modo `dev` responde 404.
- **Listado:** del más nuevo al más antiguo. `limit` entre 1 y 100 (25 por defecto). `nextCursor` es `null` en la última página; un cursor alterado responde `VALIDATION_ERROR`.
- **Detalle:** suma `currentPeriod`, `pausedOn`, `memberships` y `startProposal` (`round`, `payout`, `months`, `respondBy`, `accepted`, `withdrawn`).
- **Datos personales enmascarados:** cada miembro trae `name` (`Juana P.`), `email` (`j***@mail.com`) y `phone` (`+51******321`). Revelar el dato completo será otra acción, con motivo y auditoría.

Errores: `UNAUTHORIZED` (401) sin token, con token inválido o sin autenticación reciente; `FORBIDDEN` (403) si el rol no alcanza; `VALIDATION_ERROR` (400); `CIRCLE_NOT_FOUND` (404).

## Auditoría

Cada acción marcada con `@StaffAudited` queda en `staff_audit_log`, de solo inserción (un trigger rechaza `UPDATE`, `DELETE` y `TRUNCATE`):

- Actor (`actor_id` y `actor_email`), acción (p. ej. `circle.pause`), entidad e id, resultado (`succeeded` o `failed`), `trace_id` e IP.
- `details` guarda solo los campos declarados (p. ej. el motivo) y, si falló, el código de error. Nunca el cuerpo completo.
- Si la auditoría no se puede escribir, la respuesta no cambia (la acción ya ocurrió) y queda un error `staff.audit.write_failed` en el log para alertar.

La pausa también sigue registrándose en `circle_admin_events`, con el antes y el después.

## Probar en local

```bash
# apps/backend/.env
STAFF_AUTH_PROVIDER=dev
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:5173

curl -s -X POST localhost:3000/admin/v1/dev/sessions \
  -H 'content-type: application/json' \
  -d '{"email":"ops@ayni.local","roles":["operations"]}'
```
