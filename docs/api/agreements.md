# Contrato de API: firma del contrato y del pagaré

**Estado:** implementado en el backend (`apps/backend/src/modules/agreements`, COPAYNI-89), con **firma electrónica simple** por código al celular. Corresponde al pendiente **D3** de [pending-scope.md](../pending-scope.md).

Usa el contrato común de respuestas descrito en [auth.md](auth.md). Requiere `Authorization: Bearer <accessToken>`.

> **El texto de los documentos es provisional.** No lo redactó Legal. Las preguntas abiertas (nivel de firma, vía, cómo se fija el monto del pagaré y el texto definitivo) están en [pending-scope §3.3](../pending-scope.md#33-pagaré-ejecutable-preguntas-para-legal-p3). Con la exposición acotada a 4.200 PEN, la firma simple es proporcionada; **deja de serlo si sube el tope de payout** (§3.2, P3).

## Supuestos provisionales [?]

| Tema             | Supuesto                                                                                               | Variable                         |
| ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Nivel de firma   | Electrónica **simple**: código al celular y evidencia. Sin mérito ejecutivo (PG1)                      | —                                |
| Plazo            | 48 h desde la unión; vencido, el turno se libera y vuelve a ofrecerse                                  | `AGREEMENT_SIGNATURE_TTL_HOURS`  |
| Código           | Mismos plazos, intentos y reenvíos que el OTP del login (R10)                                          | `OTP_*`                          |
| Destino          | El celular; sin teléfono, el email                                                                     | —                                |
| Artefacto        | Texto canónico renderizado al unirse, guardado con su versión y su SHA-256. **No se genera PDF** (PG2) | —                                |
| Lectura previa   | Hay que abrir los dos documentos antes de pedir el código                                              | —                                |

## Flujo

1. Al unirse (`POST /v1/circles/join`) quedan los dos documentos **pendientes de firma** y el turno **reservado, no firme**.
2. La app lista los acuerdos, abre cada documento (lo que lo marca leído) y pide el código.
3. Con el código correcto, **ambos** documentos quedan firmados y la unión queda firme.
4. Si no se firma en 48 h, la tarea diaria marca el acuerdo `expired` y libera el turno.

## `GET /v1/me/agreements`

```json
{
  "agreements": [
    {
      "id": "0f2c…",
      "circleId": "7a91…",
      "position": 4,
      "status": "pending",
      "expiresAt": "2026-11-18T15:00:00.000Z",
      "signedAt": null,
      "unread": ["contract", "promissory_note"]
    }
  ]
}
```

`status`: `pending` (dentro del plazo), `signed` o `expired`. Con `unread` vacío se puede pedir el código.

## `GET /v1/me/agreements/{id}/documents/{document}`

`document`: `contract` o `promissory_note`. Devuelve el texto y **lo marca leído**.

```json
{
  "document": "contract",
  "version": "contract-provisional-1",
  "text": "CONTRATO DE PARTICIPACIÓN EN CÍRCULO DE AHORRO (GAME'YA)…",
  "hash": "9f86d081…",
  "readAt": "2026-11-16T15:04:00.000Z"
}
```

El texto es el que se guardó al unirse, no la plantilla vigente: la evidencia es lo que la persona leyó y firmó. Un acuerdo ya firmado o vencido se puede releer.

Errores: `AGREEMENT_NOT_FOUND` (404), `VALIDATION_ERROR` si el documento no es uno de los dos.

## `POST /v1/me/agreements/{id}/signature-code`

Sin cuerpo. Envía el código al celular; un segundo pedido lo reenvía con la ventana del OTP.

```json
{
  "challengeId": "3b7e…",
  "maskedDestination": "+51 ••• ••• 321",
  "expiresAt": "2026-11-16T15:09:00.000Z",
  "resendAvailableAt": "2026-11-16T15:04:30.000Z"
}
```

Errores: `AGREEMENT_DOCUMENTS_NOT_READ` con `details.pending` (422), `AGREEMENT_NOT_PENDING` con `details.status` (409), `SIGNATURE_DESTINATION_MISSING` (404), `RATE_LIMITED` al reenviar antes de tiempo.

## `POST /v1/me/agreements/{id}/signature`

```json
{ "code": "1234" }
```

Firma **los dos** documentos en una transacción y guarda la evidencia: fecha, IP, dispositivo y los hashes de lo que se firmó. La evidencia es de **solo inserción**: ni el personal ni la aplicación la pueden modificar.

Responde el acuerdo con `status: "signed"` y su `signedAt`.

Errores: `SIGNATURE_CODE_INVALID` con `details.attemptsRemaining` (422), `SIGNATURE_CODE_EXPIRED` (422), `SIGNATURE_ATTEMPTS_EXCEEDED` (422), `AGREEMENT_NOT_PENDING` (409).

## Efecto en el resto del producto

- **Checklist de elegibilidad** ([payments.md](payments.md)): `contract` e `insurance_note` quedan `pending` mientras falte firmar algún acuerdo, y `met` cuando no falta ninguno. Quien se unió antes de COPAYNI-89 no tiene acuerdos y los cumple: no se le exige una firma retroactiva.
- **Turno liberado:** la tarea diaria (`node dist/jobs/circle-cycle.js`) libera los turnos sin firmar **antes** de avanzar los ciclos, así un turno liberado ya cuenta como libre al evaluar si el círculo puede empezar. El acuerdo queda en `expired` como registro de quién reservó qué turno y lo dejó vencer.
- **Límite conocido:** la tarea corre una vez al día, así que un turno puede quedar reservado hasta ~24 h más que el plazo. Un círculo que empieza dentro de las 48 h de una unión podría arrancar con un acuerdo sin firmar; el checklist lo refleja.
