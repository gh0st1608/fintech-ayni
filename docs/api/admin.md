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

### Acciones de soporte

| Endpoint                                       | Roles                                        | Qué hace                                                                                                             |
| ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /admin/v1/users/:userId/sessions/revoke` | `support`, `operations`, `super_admin`       | `{ reason }`. Cierra todas las sesiones abiertas (`revokedSessions`). La persona puede volver a entrar               |
| `POST /admin/v1/users/:userId/block`           | Los mismos                                   | `{ reason }`. Cierra sus sesiones y le impide abrir otra: verificar el código y renovar responden `403 USER_BLOCKED` |
| `POST /admin/v1/users/:userId/unblock`         | Los mismos, **con step-up**                  | `{ reason }`                                                                                                         |
| `POST /admin/v1/users/:userId/pii/reveal`      | `operations`, `super_admin`, **con step-up** | `{ reason }`. Devuelve email, teléfono y nombre completos                                                            |
| `GET /admin/v1/users/:userId/notes`            | El personal operativo                        | Notas de soporte, de la más reciente a la más antigua                                                                |
| `POST /admin/v1/users/:userId/notes`           | `support`, `operations`, `super_admin`       | `{ body }` (hasta 2000 caracteres). **De solo inserción**: no se editan ni se borran                                 |

- **Todas quedan en la auditoría** con el motivo (`user.sessions.revoke`, `user.block`, `user.unblock`, `user.pii.reveal`, `user.note.add`). El motivo no se escribe en los logs de la aplicación.
- **Bloqueo:** `block` y `unblock` son idempotentes (`changed: false` si ya estaba así). El perfil (`GET /admin/v1/users/:userId`) incluye `blocked: { at, reason }` o `null`; el motivo es interno.
- **Access token vigente:** bloquear o revocar no invalida el access token que la persona ya tiene; vence solo (`ACCESS_TOKEN_TTL_SECONDS`, 15 minutos por defecto). Lo que se corta es la renovación.
- **Supuesto:** las notas de soporte no están en la matriz del plan. Las leen todos los que ven a la persona y las escriben quienes atienden (`support`, `operations` y `super_admin`).

## Cuenta de cobro

COPAYNI-81: la cuenta donde la persona recibe su pozo la registra el personal ([payouts.md](payouts.md#cuenta-de-cobro-copayni-81)).

| Endpoint                                     | Roles                                             | Qué hace                                                                                                     |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /admin/v1/users/:userId/payout-account` | `support`, `operations`, `finance`, `super_admin` | `{ current, history, banks }`: la vigente, todas las anteriores y los bancos admitidos, enmascaradas         |
| `PUT /admin/v1/users/:userId/payout-account` | `operations`, `super_admin`, **con step-up**      | Registra o reemplaza la cuenta. Cada elemento trae además `registeredBy`, `registeredByEmail` y `replacedAt` |

## Finanzas (solo lectura)

Fase 3 de [backoffice-plan.md](../backoffice-plan.md). Roles: `finance` y `super_admin`. **Ninguno mueve dinero:** el capital semilla y las correcciones pasan por la [doble aprobación](#doble-aprobación-del-fondo-de-garantía).

| Endpoint                                                            | Qué hace                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/v1/finance/installments?status=&period=&limit=&cursor=` | Cuotas del vencimiento más reciente al más antiguo, con `totals` (cantidad y suma por estado y moneda). `period` es `AAAA-MM` |
| `GET /admin/v1/finance/payouts?limit=&cursor=`                      | Pozos entregados, del más reciente al más antiguo                                                                             |
| `GET /admin/v1/finance/guarantee-fund?limit=&cursor=`               | `balances` por moneda (saldo, círculos en curso, `minimum` y `belowMinimum`) y los movimientos del fondo                      |

- **Estados de cuota:** `pending`, `paid`, `overdue`, `defaulted`, `retained` y `deducted`, como en el ciclo mensual.
- **Persona:** solo `userId` y el nombre enmascarado; finanzas no necesita email ni teléfono.
- **Mínimo del fondo:** `GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE` cuotas base por círculo en curso (R18), la misma regla que la alerta del backend.
- **Movimientos:** importe positivo entra al fondo y negativo sale. `reason` solo viene en los movimientos manuales (`seed_capital`, `adjustment`).
- **Datos simulados:** mientras el ciclo use `CIRCLE_PAYMENTS_ADAPTER=fake` y la tarea diaria siga apagada en prd, estas vistas muestran lo que haya en la base, sin conciliar contra la pasarela.

## Doble aprobación del fondo de garantía

COPAYNI-73. Una persona propone el capital semilla o una corrección y **otra** la aprueba; recién entonces se registra en el libro contable del fondo. **Regla provisional hasta cerrar BO6:** proponen y deciden `finance` y `super_admin`, y nunca la misma persona.

| Endpoint                                         | Roles                       | Qué hace                                                                                               |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /admin/v1/guarantee-fund/movements`        | `finance`, `super_admin`    | `{ kind, amount, currency, reason }`. Crea la propuesta **pendiente** (201). No mueve dinero           |
| `GET /admin/v1/approvals?status=&limit=&cursor=` | `finance`, `super_admin`    | Propuestas de la más reciente a la más antigua. `status`: `pending`, `approved`, `rejected`, `expired` |
| `POST /admin/v1/approvals/:approvalId/approve`   | Los mismos, **con step-up** | Cierra la propuesta y registra el movimiento                                                           |
| `POST /admin/v1/approvals/:approvalId/reject`    | Los mismos                  | `{ reason }`. Cierra la propuesta sin mover dinero                                                     |

- **Propuesta:** `kind` es `seed_capital` (monto positivo) o `adjustment` (positivo entra, negativo sale). `amount` en unidades menores, entero, distinto de cero y hasta 1.000.000.000. `currency` debe ser una moneda operada.
- **Respuesta:** `{ id, action, movement: { kind, amount: { amount, currency }, reason }, status, proposedBy, proposedAt, expiresAt, decidedBy, decidedAt, decisionReason }`. `proposedBy` y `decidedBy` traen `{ staffId, email }`.
- **Vencimiento:** una propuesta sin decidir vence a las `STAFF_APPROVAL_TTL_HOURS` (72 por defecto) y se lista como `expired`; no se puede aprobar.
- **Cuatro ojos:** quien propuso no puede aprobar ni rechazar (`403 APPROVAL_SELF_DECISION`). Se compara el id del personal y, si ambos lo traen, el email. La base lo refuerza con una restricción sobre el id.
- **Idempotencia y atomicidad:** primero se cierra la propuesta (solo si sigue pendiente y vigente) y después se registra el movimiento con la clave `kind:approvalId`. Si el registro falla, la propuesta vuelve a pendiente para reintentar; dos aprobaciones simultáneas no duplican el movimiento.
- **Nunca se edita ni se borra:** un error se corrige con otra propuesta de `adjustment`.
- **Auditoría:** `guarantee_fund.movement.propose` (con tipo, monto, moneda y motivo), `approval.approve` y `approval.reject` (con el motivo), cada intento con su resultado.

Errores: `VALIDATION_ERROR` (400), `APPROVAL_SELF_DECISION` o `FORBIDDEN` (403), `APPROVAL_NOT_FOUND` (404), `APPROVAL_NOT_PENDING` (409, `details.status` dice si ya se aprobó, se rechazó o venció).

## Ejecuciones del ciclo mensual

`GET /admin/v1/cycle-runs?limit=&cursor=` (`support`, `operations`, `finance` y `super_admin`): cada ejecución de la tarea diaria, de la más reciente a la más antigua, con `businessDate` (día del negocio en America/Lima), `advanced`, `locked`, `failed` y `failures` (`circleId` y el mensaje del error, recortado a 300 caracteres). La tarea guarda el resumen al terminar; si no puede guardarlo, la ejecución igual termina y queda el error `circles.cycle.run_record_failed` en el log.

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
