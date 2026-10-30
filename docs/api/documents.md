# Contrato de API: documentos y KYC

**Estado:** implementado en el backend (`apps/backend/src/modules/documents`, COPAYNI-43, 46, 47, 48 y 49) con el **almacenamiento y el proveedor de verificación simulados**. El proveedor real depende del spike COPAYNI-42 ([architecture.md §11](../architecture.md#11-verificación-de-identidad-kyc)) y el almacenamiento real es S3 con SSE-KMS. Las pantallas de mobile esperan esta API.

Usa el contrato común de respuestas descrito en [auth.md](auth.md) y el modelo [Money](circles.md#modelo-money). Requiere `Authorization: Bearer <accessToken>`.

## Supuestos provisionales [?]

| Tema              | Supuesto                                                                                                                    | Variable                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Proveedor         | `simulated` responde siempre `KYC_SIMULATED_RESULT` (por defecto `approved`); prohibido en production                       | `KYC_PROVIDER`, `KYC_SIMULATED_RESULT` |
| Sin proveedor     | `manual` deja todo documento `in_review` para el equipo de operaciones (la revisión no tiene API todavía)                   | `KYC_PROVIDER=manual`                  |
| Archivos          | JPEG, PNG o PDF de hasta 10 MB; de 1 a 10 páginas por comprobante                                                           | —                                      |
| URL de subida     | Vence a los 5 minutos; la subida se puede enviar hasta 24 h después                                                         | `DOCUMENT_UPLOAD_URL_TTL_SECONDS`      |
| Límite mensual    | Con un comprobante de ingresos aprobado: 30 % del ingreso; sin él, el límite general (R5)                                   | `PAYIN_LIMIT_INCOME_SHARE_BPS`         |
| Unirse a círculos | Exige National ID aprobado e ingreso aprobado, salvo `JOIN_IDENTITY_CHECK=assume_verified` (defecto, hasta tener proveedor) | `JOIN_IDENTITY_CHECK`                  |
| Adicionales       | Quedan en revisión manual y todavía no suben el límite (R5, R11)                                                            | —                                      |
| Retención         | Los archivos y registros se guardan sin borrado automático hasta que Legal defina la retención (L5)                         | —                                      |

## Flujo

1. `POST /v1/me/documents/uploads` por cada imagen o página: devuelve `uploadId` y una URL prefirmada.
2. La app hace `PUT` del archivo a `uploadUrl` con su `Content-Type`. El backend nunca recibe el archivo.
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

## Seguridad

- Los archivos viven en almacenamiento privado; la clave (`kyc/<userId>/<purpose>/<uploadId>`) no contiene datos personales.
- Los logs registran el tipo y el estado del documento, nunca su contenido ni el ingreso.
- El proveedor simulado no se admite en production (la validación del entorno lo rechaza).
