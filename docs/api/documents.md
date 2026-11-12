# Contrato de API: documentos y KYC

**Estado:** implementado en el backend (`apps/backend/src/modules/documents`, COPAYNI-43, 46, 47, 48 y 49) con **almacenamiento en S3** (`DOCUMENT_STORAGE=s3`, probado contra floci) o simulado, y el **proveedor de verificación simulado o manual**. La identidad se verifica en línea con VerificaID (COPAYNI-42, [ver abajo](#verificación-de-identidad-en-línea-verificaid-copayni-42)); la subida del DNI queda para la revisión manual. Las pantallas de mobile esperan esta API.

Usa el contrato común de respuestas descrito en [auth.md](auth.md) y el modelo [Money](circles.md#modelo-money). Requiere `Authorization: Bearer <accessToken>`.

## Supuestos provisionales [?]

| Tema              | Supuesto                                                                                                                           | Variable                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Proveedor         | `simulated` responde siempre `KYC_SIMULATED_RESULT` (por defecto `approved`); prohibido en production                              | `KYC_PROVIDER`, `KYC_SIMULATED_RESULT` |
| Sin proveedor     | `manual` deja todo documento `in_review`; operaciones lo resuelve en el back-office ([admin.md](admin.md#revisión-manual-del-kyc)) | `KYC_PROVIDER=manual`                  |
| Archivos          | JPEG, PNG o PDF de hasta 10 MB; de 1 a 10 páginas por comprobante                                                                  | —                                      |
| URL de subida     | Vence a los 5 minutos; la subida se puede enviar hasta 24 h después                                                                | `DOCUMENT_UPLOAD_URL_TTL_SECONDS`      |
| Límite mensual    | Con un comprobante de ingresos aprobado: 30 % del ingreso; sin él, el límite general (R5)                                          | `PAYIN_LIMIT_INCOME_SHARE_BPS`         |
| Unirse a círculos | Exige National ID aprobado e ingreso aprobado, salvo `JOIN_IDENTITY_CHECK=assume_verified` (defecto, hasta tener proveedor)        | `JOIN_IDENTITY_CHECK`                  |
| Adicionales       | Quedan en revisión manual y todavía no suben el límite (R5, R11)                                                                   | —                                      |
| Retención         | Los archivos y registros se guardan sin borrado automático hasta que Legal defina la retención (L5)                                | —                                      |

## Flujo

1. `POST /v1/me/documents/uploads` por cada imagen o página: devuelve `uploadId` y una URL prefirmada.
2. La app hace `PUT` del archivo a `uploadUrl` con el mismo `Content-Type` y el tamaño declarado, sin cabeceras de checksum. El backend nunca recibe el archivo; al enviar el documento comprueba que exista con ese tamaño.
3. La app envía el documento con los `uploadId`. Cada subida se usa una sola vez.

## `POST /v1/me/documents/uploads`

```json
{
  "purpose": "national_id_front",
  "contentType": "image/jpeg",
  "sizeBytes": 524288
}
```

`purpose`: `national_id_front`, `national_id_back`, `proof_of_income` o `additional`.

**201**

```json
{
  "uploadId": "0b0c…",
  "uploadUrl": "https://…",
  "expiresAt": "2026-10-30T15:05:00.000Z"
}
```

**400** `VALIDATION_ERROR`: propósito, tipo (`details.contentType`) o tamaño (`details.sizeBytes`) inválidos.

## `POST /v1/me/documents/national-id` (COPAYNI-47)

```json
{ "frontUploadId": "…", "backUploadId": "…" }
```

## `POST /v1/me/documents/proof-of-income` (COPAYNI-48)

```json
{ "kind": "hr_letter", "monthlyIncome": 350000, "uploadIds": ["…"] }
```

`kind`: `hr_letter` (carta de RR. HH.) o `bank_statement` (extracto). `monthlyIncome` en unidades menores de la moneda por defecto.

## `POST /v1/me/documents/additional` (COPAYNI-49)

```json
{ "kind": "utility_bill", "uploadIds": ["…"] }
```

`kind`: `utility_bill`, `driver_license` u `other`.

**200** (los tres envíos)

```json
{
  "id": "…",
  "type": "proof_of_income",
  "kind": "hr_letter",
  "status": "approved",
  "reason": null,
  "monthlyIncome": { "amount": 350000, "currency": "PEN" },
  "pages": 1,
  "submittedAt": "2026-10-30T15:01:00.000Z"
}
```

`status`: `approved`, `rejected` (con `reason` para reintentar) o `in_review`.

| Error               | HTTP | Cuándo                                                                                                       |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`  | 400  | Cuerpo inválido, `kind` desconocido, ingreso ≤ 0, páginas repetidas o fuera de 1–10                          |
| `UPLOAD_NOT_USABLE` | 422  | La subida (`details.uploadId`) no existe, es de otro usuario o propósito, ya se usó, venció o no se completó |

## `GET /v1/me/documents` (COPAYNI-46)

```json
{
  "summary": {
    "national_id": "approved",
    "proof_of_income": "in_review",
    "additional": "not_submitted"
  },
  "items": [
    { "id": "…", "type": "proof_of_income", "status": "in_review", "…": "…" }
  ]
}
```

`summary` da el estado del último documento de cada tipo; `items` va del más reciente al más antiguo.

## Verificación de identidad en línea: VerificaID (COPAYNI-42)

**Decidido por negocio el 2026-11-11:** el proveedor es [VerificaID](https://developers.verifica.id/introduction), con tres validaciones y los dos servicios que distinguen sus términos:

| Validación                | Qué comprueba                                                                | Servicio de VerificaID                                                        |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Identidad documental      | El DNI existe en RENIEC; nombres, apellidos y número coinciden con el perfil | **Consulta** (`POST /v2/consulta/personas`)                                   |
| Biometría facial          | La selfie coincide con la imagen de referencia del documento                 | **CheckMatch** (sesión KYC Bravo, `POST /api/v1/solutions/kyc-bravo/session`) |
| Prueba de vida (liveness) | La persona está presente: no es una foto, un video ni una pantalla           | **CheckMatch** (la misma sesión)                                              |

Con `KYC_PROVIDER=verificaid`. Con `simulated` (desarrollo) la Consulta coincide salvo con los DNI `00000000` (no existe) y `11111111` (otra persona), y la sesión se resuelve con `KYC_SIMULATED_RESULT`. Con `manual` no hay verificación en línea (`IDENTITY_VERIFICATION_UNAVAILABLE`) y queda la subida del DNI.

### Flujo

1. La app pide el estado con `GET`. Si es `not_started` o `rejected`, muestra el consentimiento del tratamiento biométrico (`consentVersion`) y pide el DNI.
2. `POST`: el backend hace la **Consulta**. Si el DNI no existe o los nombres no coinciden, responde `rejected` con motivo y **no abre CheckMatch** (cada uno tiene costo).
3. Si coincide, abre la sesión **CheckMatch** y responde `in_progress` con `verificationUrl`. La app abre ese enlace en el navegador del sistema, y la persona captura su DNI y su selfie con prueba de vida en el flujo de VerificaID.
4. Al terminar, VerificaID vuelve a la app (`VERIFICAID_CALLBACK_URL`) y avisa por webhook. La app consulta el `GET`, que trae el resultado desde VerificaID.

Una sesión abierta con el mismo DNI se reutiliza. Una vez aprobada, la identidad cuenta como National ID aprobado para unirse y cobrar (`KycStatusPort.identityVerified`).

### `GET /v1/me/identity-verification`

**200**

```json
{
  "status": "in_progress",
  "consentVersion": "2026-11",
  "id": "…",
  "documentNumber": "•••••912",
  "reason": null,
  "message": null,
  "verificationUrl": "https://bkyc.verifica.id/es/session/…",
  "createdAt": "2026-11-11T15:00:00.000Z",
  "decidedAt": null
}
```

`status`: `not_started`, `in_progress`, `in_review` (VerificaID la revisa a mano), `approved` o `rejected`. `verificationUrl` solo viene mientras está `in_progress`. El DNI nunca sale completo.

### `POST /v1/me/identity-verification`

```json
{ "documentNumber": "45678912", "consentVersion": "2026-11" }
```

**200**: la verificación, como en el `GET`.

| Código                              | HTTP | Cuándo                                                                                                   |
| ----------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                  | 400  | DNI sin 8 dígitos (`details.documentNumber`) o consentimiento desactualizado (`details.consentVersion`)  |
| `IDENTITY_ALREADY_VERIFIED`         | 409  | Ya está aprobada                                                                                         |
| `IDENTITY_VERIFICATION_IN_REVIEW`   | 409  | VerificaID la está revisando                                                                             |
| `IDENTITY_ATTEMPTS_EXCEEDED`        | 409  | 3 rechazos atribuibles a la persona (`IDENTITY_MAX_REJECTED_ATTEMPTS`): sube el DNI para revisión manual |
| `IDENTITY_PROFILE_INCOMPLETE`       | 422  | Faltan el nombre, el apellido o el email del perfil (`details`)                                          |
| `IDENTITY_VERIFICATION_UNAVAILABLE` | 422  | `KYC_PROVIDER=manual`                                                                                    |
| `SERVICE_UNAVAILABLE`               | 503  | VerificaID no respondió o se agotó la cuota                                                              |

Motivos de rechazo (`reason`, con `message` para mostrar):

- `document_not_found`
- `data_mismatch`
- `document_in_use`: el DNI ya está verificado en otra cuenta.
- `biometric_declined`
- `document_expired`
- `session_expired`
- `abandoned`
- `provider_error`

Solo los cuatro primeros cuentan como intento. Una sesión sin resultado vence a las `IDENTITY_SESSION_TTL_HOURS` (24 h).

**Regla de nombres (provisional, a validar con Cumplimiento):**

- Cada palabra del nombre del perfil está entre los nombres del DNI.
- El apellido del perfil incluye el paterno completo.
- No se distinguen tildes ni mayúsculas.

### Webhook `POST /v1/webhooks/verificaid?token=…`

Se configura en VerificaID como webhook de la organización (`kyc.created` y `kyc.updated`). VerificaID **no documenta una firma**, así que:

- La URL lleva un token secreto (`VERIFICAID_WEBHOOK_TOKEN`, de 32 caracteres o más). Sin él responde 401.
- El contenido solo sirve para identificar la sesión (`payload.id`). El resultado siempre se consulta a VerificaID con credenciales (`POST /api/v1/solutions/kyc-bravo/sessions/last` con el DNI declarado), y solo vale si la última sesión de ese DNI es la nuestra. Un webhook falso no puede aprobar a nadie.
- Como el token va en la query, puede aparecer en las trazas y en los logs del balanceador. Solo filtra ruido: no autoriza nada.

### Configuración

| Variable                         | Defecto                           | Nota                                                           |
| -------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `KYC_PROVIDER`                   | `simulated`                       | `verificaid`, `simulated` (prohibido en production) o `manual` |
| `VERIFICAID_API_URL`             | `https://sandbox-api.verifica.id` | En producción, `https://api.verifica.id`                       |
| `VERIFICAID_API_TOKEN`           | —                                 | Secreto (prod-hub.verifica.id); obligatorio con `verificaid`   |
| `VERIFICAID_WEBHOOK_TOKEN`       | —                                 | Secreto; obligatorio con `verificaid`                          |
| `VERIFICAID_CALLBACK_URL`        | `ayni://identity-verification`    | Retorno a la app al terminar                                   |
| `VERIFICAID_TIMEOUT_MS`          | `10000`                           |                                                                |
| `IDENTITY_CONSENT_VERSION`       | `2026-11`                         | Cambiarla obliga a aceptar el texto nuevo                      |
| `IDENTITY_MAX_REJECTED_ATTEMPTS` | `3`                               |                                                                |
| `IDENTITY_SESSION_TTL_HOURS`     | `24`                              |                                                                |

### Pendiente de confirmar con VerificaID [verificar]

- Qué código devuelve la Consulta para un DNI que no existe (se tratan 404 y 422 como "no encontrado").
- Si `callback_url` es la URL de retorno de la persona (así se usa) y si acepta un deep link (`ayni://`) o exige `https`.
- La firma de los webhooks y dónde se configura la URL de la organización.
- Si hay un endpoint para consultar una sesión por id con el detalle de `liveness` y `face_match`. Hoy solo se usa el estado de la sesión.
- Contra qué imagen compara CheckMatch: la del documento capturado o la de RENIEC (o ID Perú).
- El proveedor subyacente (la especificación OpenAPI menciona Didit), la región de procesamiento y la retención de las imágenes (L3, L5).
- La cuota por plan (`X-Quota-Limit`, `X-Quota-Remaining`) y el precio de Consulta y de CheckMatch.

## Seguridad

- Los archivos viven en almacenamiento privado; la clave (`kyc/<userId>/<purpose>/<uploadId>`) no contiene datos personales.
- Los logs registran el tipo y el estado del documento, nunca su contenido ni el ingreso.
- El proveedor simulado no se admite en production (la validación del entorno lo rechaza).
- La verificación en línea guarda el DNI declarado, para consultar el resultado y evitar que un DNI quede verificado en dos cuentas. Nunca guarda imágenes ni datos biométricos: esos quedan en VerificaID.
- Los logs registran el id, el usuario y el resultado, nunca el DNI ni los nombres. Además, el logger oculta `documentNumber`.
- El consentimiento del tratamiento biométrico se guarda con su versión y su fecha (`identity_verifications.consent_version` y `consented_at`).
