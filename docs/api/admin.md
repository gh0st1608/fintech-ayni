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

## Revisión manual del KYC

Con `KYC_PROVIDER=manual`, cada documento queda `in_review` hasta que el personal lo resuelve (fase 2 de [backoffice-plan.md](../backoffice-plan.md)). Roles: `operations` y `super_admin`; soporte y finanzas no ven documentos.

| Endpoint                                                 | Qué hace                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/v1/kyc/reviews?status=&type=&limit=&cursor=` | La cola. `status` es `in_review` por defecto (del más antiguo al más nuevo); `approved` y `rejected` van del más reciente al más antiguo |
| `GET /admin/v1/kyc/reviews/:id`                          | El documento, sus páginas (`pageFiles`) y la persona enmascarada                                                                         |
| `GET /admin/v1/kyc/reviews/:id/pages/:page/url`          | URL de lectura de **60 s** para ver una página en el navegador. **Auditada** (`kyc.document.view`)                                       |
| `POST /admin/v1/kyc/reviews/:id/approve`                 | `{ monthlyIncome?, note? }`. **Auditada** (`kyc.approve`)                                                                                |
| `POST /admin/v1/kyc/reviews/:id/reject`                  | `{ reason, note? }`. **Auditada** (`kyc.reject`)                                                                                         |

- **Motivo del rechazo:** `reason` es un código de un catálogo fijo; la persona ve su texto en la app para corregir y reenviar. El personal no escribe texto que llegue al usuario.

  | Código            | Texto que ve la persona                                          |
  | ----------------- | ---------------------------------------------------------------- |
  | `illegible`       | El documento no se pudo leer: vuelve a escanearlo                |
  | `incomplete`      | Faltan páginas o partes del documento: vuelve a subirlo completo |
  | `expired`         | El documento está vencido: sube uno vigente                      |
  | `data_mismatch`   | Los datos del documento no coinciden con los de tu perfil        |
  | `not_recent`      | El comprobante no es reciente: sube uno de los últimos 3 meses   |
  | `income_mismatch` | El ingreso declarado no coincide con el comprobante              |
  | `wrong_document`  | El archivo no corresponde al documento pedido                    |

  Los textos son provisionales hasta que UX y Legal los revisen.

- **Nota interna (`note`):** solo queda en la auditoría.
- **Ingreso corregido:** al aprobar un comprobante de ingresos, `monthlyIncome` (unidades menores) reemplaza al declarado si el documento dice otro. Es el que usa el límite mensual. En otro tipo de documento responde `INCOME_ADJUSTMENT_NOT_ALLOWED` (422).
- **Una sola decisión:** si dos personas resuelven el mismo documento a la vez, solo una lo logra; la otra recibe `KYC_ALREADY_REVIEWED` (409) con el estado que quedó.
- **`superseded`:** la persona envió después otro documento del mismo tipo; conviene revisar el más nuevo.
- **Sin step-up (supuesto):** aprobar o rechazar no exige autenticación reciente, para no frenar la cola. Se puede exigir si Seguridad lo pide.
- **Quién lo resolvió:** queda en `reviewedBy` (el id del personal) y en la auditoría.

Errores: `KYC_REVIEW_NOT_FOUND` y `KYC_PAGE_NOT_FOUND` (404), además de los comunes.

## Búsqueda de personas

Para soporte (fase 2 de [backoffice-plan.md](../backoffice-plan.md)). Roles: `support`, `operations`, `finance` y `super_admin`.

| Endpoint                      | Qué hace                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/v1/users?query=`  | Busca por **email completo**, **teléfono con código de país** (`+51…`, admite espacios y guiones) o **id**. **Auditada** (`user.search`) |
| `GET /admin/v1/users/:userId` | Perfil, estado del último documento de cada tipo (`kyc`) y juntas (`circles`). **Auditada** (`user.view`)                                |

- **Solo coincidencia exacta:** una búsqueda parcial (`rosa`, `987654321`) responde `VALIDATION_ERROR` con `details.query`. Así no se puede recorrer la base con datos personales.
- **Enmascarado:** `name`, `email` y `phone` salen enmascarados, igual que en juntas.
- **Auditoría sin el dato buscado:** la búsqueda queda registrada con el actor, pero sin el email ni el teléfono que se buscó.
- `kyc` usa los mismos valores que `GET /v1/me/documents`: `not_submitted`, `in_review`, `approved` o `rejected`.

Errores: `USER_NOT_FOUND` (404), además de los comunes.

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
