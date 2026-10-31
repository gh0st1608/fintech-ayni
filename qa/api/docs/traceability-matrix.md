# Matriz de trazabilidad

Generada por `npm run build` desde la colección: requisito de Jira → caso de prueba → request. La columna **prd** indica si el caso corre en producción.

| Caso | Carpeta | Descripción | Request | Requisito | prd |
| --- | --- | --- | --- | --- | --- |
| TC-OPS-HEALTH-LIVE-001 | 00-Framework / Health-Check | Liveness responde ok | GET /health/live | COPAYNI-10 | sí |
| TC-FUNC-FRAMEWORK-ENV-001 | 00-Framework / Environment-Validation | El ambiente tiene las variables requeridas | GET /health/ready | COPAYNI-10 | sí |
| TC-FUNC-AUTH-SETUP-A01 | 00-Framework / Authentication-Setup | Usuario A: inicia sesión con email | POST /v1/auth/start | COPAYNI-19 | no |
| TC-FUNC-AUTH-SETUP-A02 | 00-Framework / Authentication-Setup | Usuario A: verifica el OTP y guarda los tokens | POST /v1/auth/verify | COPAYNI-20 | no |
| TC-FUNC-AUTH-SETUP-B01 | 00-Framework / Authentication-Setup | Usuario B: inicia sesión con email | POST /v1/auth/start | COPAYNI-19 | no |
| TC-FUNC-AUTH-SETUP-B02 | 00-Framework / Authentication-Setup | Usuario B: verifica el OTP y guarda los tokens | POST /v1/auth/verify | COPAYNI-20 | no |
| TC-FUNC-AUTH-START-001 | 01-Authentication / Positive | Inicia sesión con teléfono E.164 | POST /v1/auth/start | COPAYNI-19 · CA: OTP por SMS al teléfono | no |
| TC-FUNC-AUTH-VERIFY-002 | 01-Authentication / Positive | Verifica el OTP del teléfono | POST /v1/auth/verify | COPAYNI-20 | no |
| TC-FUNC-AUTH-REFRESH-003 | 01-Authentication / Positive | Renueva la sesión y rota el refresh token | POST /v1/auth/refresh | COPAYNI-21 · rotación obligatoria | no |
| TC-FUNC-AUTH-LOGOUT-004 | 01-Authentication / Positive | Cierra la sesión | POST /v1/auth/logout | COPAYNI-21 | no |
| TC-FUNC-AUTH-LOGOUT-005 | 01-Authentication / Positive | Cerrar sesión otra vez es idempotente | POST /v1/auth/logout | COPAYNI-21 · logout idempotente | no |
| TC-NEG-AUTH-START-001 | 01-Authentication / Negative | Email con formato inválido | POST /v1/auth/start | COPAYNI-19 | sí |
| TC-NEG-AUTH-START-002 | 01-Authentication / Negative | Tipo de identificador desconocido | POST /v1/auth/start | COPAYNI-19 | sí |
| TC-NEG-AUTH-START-003 | 01-Authentication / Negative | Teléfono sin código de país | POST /v1/auth/start | COPAYNI-19 · E.164 | sí |
| TC-NEG-AUTH-VERIFY-004 | 01-Authentication / Negative | Usuario D: inicia sesión para las pruebas de OTP | POST /v1/auth/start | COPAYNI-20 | no |
| TC-NEG-AUTH-VERIFY-005 | 01-Authentication / Negative | Código incorrecto descuenta intentos | POST /v1/auth/verify | COPAYNI-20 | no |
| TC-NEG-AUTH-VERIFY-006 | 01-Authentication / Negative | Desafío inexistente | POST /v1/auth/verify | COPAYNI-20 | sí |
| TC-NEG-AUTH-RESEND-007 | 01-Authentication / Negative | Reenvío antes de resendAvailableAt | POST /v1/auth/resend | COPAYNI-20 · contador de reenvío | no |
| TC-NEG-AUTH-RESEND-008 | 01-Authentication / Negative | Reenvío de un desafío inexistente | POST /v1/auth/resend | COPAYNI-20 | no |
| TC-SEC-AUTH-RATE-009 | 01-Authentication / Negative | El sexto inicio del mismo identificador se limita | POST /v1/auth/start | COPAYNI-19 · 5 inicios por identificador cada 15 min (R10) | no |
| TC-SEC-AUTH-TOKEN-001 | 01-Authentication / Token-Lifecycle | Sin token: 401 | GET /v1/me | COPAYNI-21 | sí |
| TC-SEC-AUTH-TOKEN-002 | 01-Authentication / Token-Lifecycle | Token mal formado: 401 | GET /v1/me | COPAYNI-21 | sí |
| TC-SEC-AUTH-TOKEN-003 | 01-Authentication / Token-Lifecycle | JWT con alg none: 401 | GET /v1/me | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTH-TOKEN-004 | 01-Authentication / Token-Lifecycle | Access token con la firma alterada: 401 | GET /v1/me | COPAYNI-21 | no |
| TC-SEC-AUTH-TOKEN-005 | 01-Authentication / Token-Lifecycle | Refresh token inválido: 401 | POST /v1/auth/refresh | COPAYNI-21 | sí |
| TC-SEC-AUTH-TOKEN-006 | 01-Authentication / Token-Lifecycle | Reutilizar un refresh token ya rotado: 401 | POST /v1/auth/refresh | COPAYNI-21 · detección de robo (revoca la familia) | no |
| TC-FUNC-USER-ME-001 | 02-Users | Consulta su perfil | GET /v1/me | COPAYNI-44 | no |
| TC-FUNC-USER-ME-002 | 02-Users | Actualiza nombre y apellido | PATCH /v1/me | COPAYNI-45 · recorta espacios | no |
| TC-FUNC-USER-ME-003 | 02-Users | Cambia el idioma preferido | PATCH /v1/me | COPAYNI-50 | no |
| TC-FUNC-USER-ME-004 | 02-Users | Nombre de 80 caracteres (límite) | PATCH /v1/me | COPAYNI-45 · BVA 1–80 | no |
| TC-NEG-USER-ME-005 | 02-Users | Nombre de 81 caracteres | PATCH /v1/me | COPAYNI-45 · BVA 1–80 | no |
| TC-NEG-USER-ME-006 | 02-Users | Cuerpo vacío | PATCH /v1/me | COPAYNI-45 | no |
| TC-NEG-USER-ME-007 | 02-Users | Nombre con < y > | PATCH /v1/me | COPAYNI-45 · rechaza < > | no |
| TC-NEG-USER-ME-008 | 02-Users | Campo no permitido (email por PATCH) | PATCH /v1/me | COPAYNI-45 · el email se cambia con OTP | no |
| TC-NEG-USER-ME-009 | 02-Users | Idioma con formato inválido | PATCH /v1/me | COPAYNI-50 · BCP 47 | no |
| TC-NEG-USER-CONTACT-010 | 02-Users | Cambiar al mismo email que ya tiene | POST /v1/me/contact/start | COPAYNI-45 · R9 | no |
| TC-NEG-USER-CONTACT-011 | 02-Users | Pide cambiar al email de otra cuenta | POST /v1/me/contact/start | COPAYNI-45 · no revela si el dato existe antes de verificar | no |
| TC-NEG-USER-CONTACT-012 | 02-Users | Verifica el email de otra cuenta: CONTACT_TAKEN | POST /v1/me/contact/verify | COPAYNI-45 · R9 | no |
| TC-FUNC-USER-CONTACT-013 | 02-Users | Pide cambiar a un email nuevo | POST /v1/me/contact/start | COPAYNI-45 · R9 | no |
| TC-FUNC-USER-CONTACT-014 | 02-Users | Verifica el email nuevo y se aplica | POST /v1/me/contact/verify | COPAYNI-45 · R9 | no |
| TC-SEC-USER-INPUT-015 | 02-Users | Texto con comillas y SQL se guarda literal | PATCH /v1/me | COPAYNI-45 · OWASP API8 (inyección) | no |
| TC-CONTRACT-CIRCLE-CONFIG-001 | 03-Circles | join-config cumple el contrato | GET /v1/circles/join-config | COPAYNI-28 | no |
| TC-FUNC-CIRCLE-OPTIONS-002 | 03-Circles | Cuotas y duraciones para un payout válido | GET /v1/circles/installment-options?payoutAmount={{payoutValid}} | COPAYNI-29 | no |
| TC-FUNC-CIRCLE-OPTIONS-003 | 03-Circles | Payout mínimo (límite) | GET /v1/circles/installment-options?payoutAmount={{payoutMin}} | COPAYNI-29 · BVA | no |
| TC-NEG-CIRCLE-OPTIONS-004 | 03-Circles | Payout fuera del salto (mínimo + 1) | GET /v1/circles/installment-options?payoutAmount={{payoutOffStep}} | COPAYNI-29 · BVA | no |
| TC-NEG-CIRCLE-OPTIONS-005 | 03-Circles | Payout sobre el máximo (máximo + salto) | GET /v1/circles/installment-options?payoutAmount={{payoutAboveMax}} | COPAYNI-29 · BVA | no |
| TC-NEG-CIRCLE-OPTIONS-006 | 03-Circles | Sin payoutAmount | GET /v1/circles/installment-options | COPAYNI-29 | no |
| TC-NEG-CIRCLE-OPTIONS-007 | 03-Circles | payoutAmount no entero | GET /v1/circles/installment-options?payoutAmount=abc | COPAYNI-29 | no |
| TC-FUNC-CIRCLE-SLOTS-008 | 03-Circles | Slots del círculo ofrecido | GET /v1/circles/slots?payoutAmount={{payoutValid}}&months={{months}} | COPAYNI-30 · COPAYNI-60 | no |
| TC-NEG-CIRCLE-SLOTS-009 | 03-Circles | Duración no ofrecida | GET /v1/circles/slots?payoutAmount={{payoutValid}}&months=7 | COPAYNI-30 | no |
| TC-CONTRACT-CIRCLE-RECOMMENDED-010 | 03-Circles | Recomendados cumplen el contrato | GET /v1/circles/recommended | COPAYNI-25 | no |
| TC-FUNC-PAYOUT-SETUP-A01 | 03-Circles | Usuario A elige método de cobro (precondición de la unión) | PUT /v1/me/payout-method | COPAYNI-31 · la unión exige método de cobro (PAYOUT_METHOD_REQUIRED) | no |
| TC-FUNC-PAYOUT-SETUP-B01 | 03-Circles | Usuario B elige método de cobro (precondición de la unión) | PUT /v1/me/payout-method | COPAYNI-31 · la unión exige método de cobro (PAYOUT_METHOD_REQUIRED) | no |
| TC-NEG-CIRCLE-JOIN-011 | 03-Circles | Unirse sin Idempotency-Key | POST /v1/circles/join | COPAYNI-31 · idempotencia | no |
| TC-NEG-CIRCLE-JOIN-012 | 03-Circles | Turno que la regla de confianza no permite | POST /v1/circles/join | COPAYNI-60 · trust_required | no |
| TC-NEG-CIRCLE-JOIN-013 | 03-Circles | Posición mayor que la duración | POST /v1/circles/join | COPAYNI-31 · BVA | no |
| TC-FUNC-CIRCLE-JOIN-014 | 03-Circles | Se une al círculo | POST /v1/circles/join | COPAYNI-31 · COPAYNI-55 (precio congelado) | no |
| TC-FUNC-CIRCLE-JOIN-015 | 03-Circles | Reintento con la misma clave: misma unión | POST /v1/circles/join | COPAYNI-31 · idempotencia | no |
| TC-NEG-CIRCLE-JOIN-016 | 03-Circles | Misma clave con otros datos | POST /v1/circles/join | COPAYNI-31 · idempotencia | no |
| TC-NEG-CIRCLE-JOIN-017 | 03-Circles | Segundo slot en el mismo círculo | POST /v1/circles/join | COPAYNI-24 · un slot por usuario | no |
| TC-NEG-CIRCLE-JOIN-018 | 03-Circles | Otro usuario intenta el mismo slot | POST /v1/circles/join | COPAYNI-31 · reserva atómica del slot | no |
| TC-FUNC-CIRCLE-MINE-019 | 03-Circles | Mis círculos activos incluyen el nuevo | GET /v1/me/circles?status=active | COPAYNI-26 | no |
| TC-FUNC-CIRCLE-MINE-020 | 03-Circles | Mis círculos finalizados: vacío | GET /v1/me/circles?status=finished | COPAYNI-26 | no |
| TC-NEG-CIRCLE-MINE-021 | 03-Circles | status inválido | GET /v1/me/circles?status=paused | COPAYNI-26 | no |
| TC-NEG-CIRCLE-MINE-022 | 03-Circles | limit fuera de rango (0) | GET /v1/me/circles?status=active&limit=0 | COPAYNI-26 · BVA | no |
| TC-NEG-CIRCLE-MINE-023 | 03-Circles | cursor inválido | GET /v1/me/circles?status=active&cursor=no-es-un-cursor | COPAYNI-26 | no |
| TC-FUNC-PAYOUT-METHOD-001 | 04-Payments | Catálogo de métodos de cobro | GET /v1/me/payout-method | COPAYNI-37 | no |
| TC-FUNC-PAYOUT-METHOD-002 | 04-Payments | Elige transferencia bancaria | PUT /v1/me/payout-method | COPAYNI-37 | no |
| TC-NEG-PAYOUT-METHOD-003 | 04-Payments | Método fuera del catálogo | PUT /v1/me/payout-method | COPAYNI-37 · T5 | no |
| TC-NEG-PAYOUT-METHOD-004 | 04-Payments | Sin method | PUT /v1/me/payout-method | COPAYNI-37 | no |
| TC-FUNC-PAY-SETTINGS-005 | 04-Payments | Preferencias de pago por defecto | GET /v1/me/payment-settings | COPAYNI-38 | no |
| TC-FUNC-PAY-SETTINGS-006 | 04-Payments | Activa descontar la cuota del payout | PATCH /v1/me/payment-settings | COPAYNI-38 | no |
| TC-NEG-PAY-SETTINGS-007 | 04-Payments | Valor no booleano | PATCH /v1/me/payment-settings | COPAYNI-38 | no |
| TC-FUNC-PAY-ELIGIBILITY-008 | 04-Payments | Elegibilidad del payout | GET /v1/me/payout-eligibility | COPAYNI-36 | no |
| TC-CONTRACT-PAY-SUMMARY-009 | 04-Payments | Resumen de pagos cumple el contrato | GET /v1/me/payments/summary | COPAYNI-35 | no |
| TC-FUNC-PAY-TX-010 | 04-Payments | Historial de pagos | GET /v1/me/transactions?type=payment&limit=20 | COPAYNI-41 | no |
| TC-NEG-PAY-TX-011 | 04-Payments | Historial sin type | GET /v1/me/transactions | COPAYNI-41 | no |
| TC-NEG-PAY-TX-012 | 04-Payments | Historial con limit 51 | GET /v1/me/transactions?type=payout&limit=51 | COPAYNI-41 · BVA 1–50 | no |
| TC-FUNC-CARD-ADD-013 | 04-Payments | Guarda la primera tarjeta | POST /v1/me/cards | COPAYNI-40 | no |
| TC-FUNC-CARD-ADD-014 | 04-Payments | Reintento con la misma clave: la misma tarjeta | POST /v1/me/cards | COPAYNI-40 · idempotencia | no |
| TC-NEG-CARD-ADD-015 | 04-Payments | Tarjeta rechazada por la pasarela | POST /v1/me/cards | COPAYNI-40 | no |
| TC-NEG-CARD-ADD-016 | 04-Payments | Guardar tarjeta sin Idempotency-Key | POST /v1/me/cards | COPAYNI-40 | no |
| TC-FUNC-CARD-ADD-017 | 04-Payments | Guarda una segunda tarjeta | POST /v1/me/cards | COPAYNI-39 | no |
| TC-FUNC-CARD-LIST-018 | 04-Payments | Lista con la predeterminada primero | GET /v1/me/cards | COPAYNI-39 | no |
| TC-NEG-CARD-DELETE-019 | 04-Payments | Borrar la predeterminada habiendo otras | DELETE /v1/me/cards/{{cardId1}} | COPAYNI-39 | no |
| TC-FUNC-CARD-DEFAULT-020 | 04-Payments | Cambia la predeterminada | PUT /v1/me/cards/{{cardId2}}/default | COPAYNI-39 | no |
| TC-SEC-CARD-BOLA-021 | 04-Payments | Otro usuario intenta borrar la tarjeta (BOLA) | DELETE /v1/me/cards/{{cardId1}} | COPAYNI-39 · OWASP API1 | no |
| TC-FUNC-CARD-DELETE-022 | 04-Payments | Borra la tarjeta que ya no es predeterminada | DELETE /v1/me/cards/{{cardId1}} | COPAYNI-39 | no |
| TC-NEG-CARD-DELETE-023 | 04-Payments | Borrar con un id que no es UUID | DELETE /v1/me/cards/no-es-uuid | COPAYNI-39 | no |
| TC-NEG-INSTALLMENT-PAY-024 | 04-Payments | Pagar una cuota inexistente | POST /v1/me/installments/00000000-0000-4000-8000-000000000000/pay | COPAYNI-63 | no |
| TC-NEG-INSTALLMENT-PAY-025 | 04-Payments | Pagar sin Idempotency-Key | POST /v1/me/installments/00000000-0000-4000-8000-000000000000/pay | COPAYNI-63 | no |
| TC-NEG-INSTALLMENT-PAY-026 | 04-Payments | Método de pago inválido | POST /v1/me/installments/00000000-0000-4000-8000-000000000000/pay | COPAYNI-63 | no |
| TC-FUNC-DOC-LIST-001 | 05-Documents | Mis documentos: nada enviado | GET /v1/me/documents | COPAYNI-46 | no |
| TC-FUNC-DOC-UPLOAD-002 | 05-Documents | Pide subir el anverso del DNI | POST /v1/me/documents/uploads | COPAYNI-47 | no |
| TC-INTEGRATION-DOC-PUT-003 | 05-Documents | Sube el anverso a S3 | PUT {{uploadFrontUrl}} | COPAYNI-43 | no |
| TC-FUNC-DOC-UPLOAD-004 | 05-Documents | Pide subir el reverso del DNI | POST /v1/me/documents/uploads | COPAYNI-47 | no |
| TC-INTEGRATION-DOC-PUT-005 | 05-Documents | Sube el reverso a S3 | PUT {{uploadBackUrl}} | COPAYNI-43 | no |
| TC-NEG-DOC-UPLOAD-006 | 05-Documents | Tipo de archivo no admitido | POST /v1/me/documents/uploads | COPAYNI-43 | no |
| TC-NEG-DOC-UPLOAD-007 | 05-Documents | Tamaño 0 (límite inferior) | POST /v1/me/documents/uploads | COPAYNI-43 · BVA | no |
| TC-NEG-DOC-UPLOAD-008 | 05-Documents | Más de 10 MB (límite superior + 1) | POST /v1/me/documents/uploads | COPAYNI-43 · BVA | no |
| TC-NEG-DOC-UPLOAD-009 | 05-Documents | Propósito desconocido | POST /v1/me/documents/uploads | COPAYNI-43 | no |
| TC-SEC-DOC-BOLA-010 | 05-Documents | Otro usuario envía las subidas ajenas (BOLA) | POST /v1/me/documents/national-id | COPAYNI-47 · OWASP API1 | no |
| TC-FUNC-DOC-NATIONAL-ID-011 | 05-Documents | Envía el DNI | POST /v1/me/documents/national-id | COPAYNI-47 | no |
| TC-NEG-DOC-NATIONAL-ID-012 | 05-Documents | Reusar las mismas subidas | POST /v1/me/documents/national-id | COPAYNI-47 · cada subida se usa una vez | no |
| TC-FUNC-DOC-UPLOAD-013 | 05-Documents | Pide subir el comprobante (PDF) | POST /v1/me/documents/uploads | COPAYNI-48 | no |
| TC-INTEGRATION-DOC-PUT-014 | 05-Documents | Sube el comprobante a S3 | PUT {{uploadIncomeUrl}} | COPAYNI-43 | no |
| TC-NEG-DOC-INCOME-015 | 05-Documents | Ingreso igual a 0 (límite) | POST /v1/me/documents/proof-of-income | COPAYNI-48 · BVA | no |
| TC-NEG-DOC-INCOME-016 | 05-Documents | Tipo de comprobante desconocido | POST /v1/me/documents/proof-of-income | COPAYNI-48 | no |
| TC-NEG-DOC-INCOME-017 | 05-Documents | Once páginas (límite 1–10 + 1) | POST /v1/me/documents/proof-of-income | COPAYNI-48 · BVA | no |
| TC-FUNC-DOC-INCOME-018 | 05-Documents | Envía el comprobante de ingresos | POST /v1/me/documents/proof-of-income | COPAYNI-48 | no |
| TC-FUNC-DOC-LIST-019 | 05-Documents | Mis documentos reflejan los envíos | GET /v1/me/documents | COPAYNI-46 | no |
| TC-DATA-USER-LIMIT-020 | 05-Documents | El ingreso aprobado fija el límite mensual (R5) | GET /v1/me | COPAYNI-44 · COPAYNI-48 · R5 | no |
| TC-FUNC-REFERRAL-MINE-001 | 06-Referrals-Savings | Mi código de invitación | GET /v1/me/referral | COPAYNI-51 | no |
| TC-FUNC-REFERRAL-MINE-002 | 06-Referrals-Savings | El código no cambia entre consultas | GET /v1/me/referral | COPAYNI-51 | no |
| TC-NEG-REFERRAL-CLAIM-003 | 06-Referrals-Savings | Usar el código propio | POST /v1/me/referral/claim | COPAYNI-51 | no |
| TC-NEG-REFERRAL-CLAIM-004 | 06-Referrals-Savings | Código con formato inválido | POST /v1/me/referral/claim | COPAYNI-51 | no |
| TC-NEG-REFERRAL-CLAIM-005 | 06-Referrals-Savings | Código inexistente | POST /v1/me/referral/claim | COPAYNI-51 | no |
| TC-FUNC-REFERRAL-CLAIM-006 | 06-Referrals-Savings | B usa el código de A (minúsculas y espacios) | POST /v1/me/referral/claim | COPAYNI-51 · se ignoran mayúsculas y espacios | no |
| TC-NEG-REFERRAL-CLAIM-007 | 06-Referrals-Savings | B usa un código por segunda vez | POST /v1/me/referral/claim | COPAYNI-51 · una sola vez por usuario | no |
| TC-FUNC-REFERRAL-MINE-008 | 06-Referrals-Savings | Código de B | GET /v1/me/referral | COPAYNI-51 | no |
| TC-NEG-REFERRAL-CLAIM-009 | 06-Referrals-Savings | A (ya en un círculo) usa el código de B | POST /v1/me/referral/claim | COPAYNI-51 · el beneficio es para el primer círculo | no |
| TC-DATA-REFERRAL-LIST-010 | 06-Referrals-Savings | Mis referidos: saldo coherente e invitado minimizado | GET /v1/me/referrals?limit=20 | COPAYNI-52 · saldo = ganado − canjeado | no |
| TC-NEG-REFERRAL-LIST-011 | 06-Referrals-Savings | Mis referidos con limit 51 | GET /v1/me/referrals?limit=51 | COPAYNI-52 · BVA 1–50 | no |
| TC-CONTRACT-SAVING-PLANS-012 | 06-Referrals-Savings | Planes de ahorro | GET /v1/savings/plans | COPAYNI-32 | no |
| TC-DATA-SAVING-QUOTE-013 | 06-Referrals-Savings | Cotización coherente | GET /v1/savings/plans/{{savingPlanId}}/quote?months={{savingMonths}} | COPAYNI-33 | no |
| TC-NEG-SAVING-QUOTE-014 | 06-Referrals-Savings | Duración no ofrecida | GET /v1/savings/plans/{{savingPlanId}}/quote?months=7 | COPAYNI-33 | no |
| TC-NEG-SAVING-QUOTE-015 | 06-Referrals-Savings | Plan inexistente | GET /v1/savings/plans/plan-inexistente/quote?months={{savingMonths}} | COPAYNI-33 | no |
| TC-SEC-AUTHN-PROTECTED-010 | 07-Security | /v1/circles/join-config exige token | GET /v1/circles/join-config | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTHN-PROTECTED-011 | 07-Security | /v1/me/circles?status=active exige token | GET /v1/me/circles?status=active | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTHN-PROTECTED-012 | 07-Security | /v1/me/cards exige token | GET /v1/me/cards | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTHN-PROTECTED-013 | 07-Security | /v1/me/documents exige token | GET /v1/me/documents | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTHN-PROTECTED-014 | 07-Security | /v1/me/referrals exige token | GET /v1/me/referrals | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTHN-PROTECTED-015 | 07-Security | /v1/savings/plans exige token | GET /v1/savings/plans | COPAYNI-21 · OWASP API2 | sí |
| TC-SEC-AUTHZ-ADMIN-001 | 07-Security | API de administración sin credenciales | POST /admin/v1/circles/00000000-0000-4000-8000-000000000000/pause | COPAYNI-61 | sí |
| TC-SEC-AUTHZ-ADMIN-002 | 07-Security | Un usuario de la app no administra (BFLA) | POST /admin/v1/circles/00000000-0000-4000-8000-000000000000/pause | COPAYNI-61 · OWASP API5 | no |
| TC-SEC-WEBHOOK-003 | 07-Security | Webhook de Mercado Pago sin firma | POST /v1/webhooks/mercadopago | COPAYNI-63 · x-signature | sí |
| TC-SEC-HEADERS-004 | 07-Security | No revela la tecnología del servidor | GET /health/live | OWASP API8 · security headers | sí |
| TC-SEC-ERROR-005 | 07-Security | Ruta inexistente: 404 con el sobre estándar | GET /v1/no-existe | COPAYNI-8 · contrato de errores | sí |
| TC-SEC-DATA-006 | 07-Security | Las tarjetas guardadas no exponen datos sensibles | GET /v1/me/cards | COPAYNI-39 · PCI-DSS (COPAYNI-34) | no |
| TC-SEC-DATA-007 | 07-Security | El perfil de otro usuario no es accesible por id | GET /v1/me | COPAYNI-44 · OWASP API1 | no |
| TC-REGRESSION-SMOKE-001 | 08-Regression / Smoke | Perfil | GET /v1/me | COPAYNI-44 | con token |
| TC-REGRESSION-SMOKE-002 | 08-Regression / Smoke | Configuración de unión | GET /v1/circles/join-config | COPAYNI-28 | con token |
| TC-REGRESSION-SMOKE-003 | 08-Regression / Smoke | Mis círculos | GET /v1/me/circles?status=active | COPAYNI-26 | con token |
| TC-REGRESSION-SMOKE-004 | 08-Regression / Smoke | Resumen de pagos | GET /v1/me/payments/summary | COPAYNI-35 | con token |
| TC-REGRESSION-SMOKE-005 | 08-Regression / Smoke | Mis documentos | GET /v1/me/documents | COPAYNI-46 | con token |
| TC-REGRESSION-SMOKE-006 | 08-Regression / Smoke | Planes de ahorro | GET /v1/savings/plans | COPAYNI-32 | con token |
| TC-REGRESSION-JOIN-001 | 08-Regression / Critical-Flows | Usuario C: inicia sesión con email | POST /v1/auth/start | COPAYNI-19 | no |
| TC-REGRESSION-JOIN-002 | 08-Regression / Critical-Flows | Usuario C: verifica el OTP y guarda los tokens | POST /v1/auth/verify | COPAYNI-20 | no |
| TC-REGRESSION-JOIN-003 | 08-Regression / Critical-Flows | Configuración de unión | GET /v1/circles/join-config | COPAYNI-28 | no |
| TC-REGRESSION-JOIN-004 | 08-Regression / Critical-Flows | Cuotas del monto elegido | GET /v1/circles/installment-options?payoutAmount={{flowPayout}} | COPAYNI-29 | no |
| TC-REGRESSION-JOIN-005 | 08-Regression / Critical-Flows | Turnos disponibles | GET /v1/circles/slots?payoutAmount={{flowPayout}}&months={{flowMonths}} | COPAYNI-30 | no |
| TC-REGRESSION-JOIN-006 | 08-Regression / Critical-Flows | Sin método de cobro no puede unirse | POST /v1/circles/join | COPAYNI-31 · COPAYNI-37 | no |
| TC-REGRESSION-JOIN-007 | 08-Regression / Critical-Flows | Elige el método de cobro | PUT /v1/me/payout-method | COPAYNI-37 | no |
| TC-REGRESSION-JOIN-008 | 08-Regression / Critical-Flows | Confirma la unión | POST /v1/circles/join | COPAYNI-31 | no |
| TC-REGRESSION-JOIN-009 | 08-Regression / Critical-Flows | Lo ve en Mis círculos | GET /v1/me/circles?status=active | COPAYNI-26 | no |
| TC-REGRESSION-JOIN-010 | 08-Regression / Critical-Flows | Su elegibilidad muestra el método de cobro | GET /v1/me/payout-eligibility | COPAYNI-36 | no |
| TC-OPS-HEALTH-READY-002 | 09-Operational | Readiness responde ok | GET /health/ready | COPAYNI-10 | sí |
| TC-OPS-HEALTH-NOAUTH-003 | 09-Operational | Health no exige autenticación aunque llegue un token inválido | GET /health/live | COPAYNI-10 | sí |
| TC-OPS-TRACE-004 | 09-Operational | Cada respuesta trae un traceId distinto | GET /health/live | COPAYNI-10 · correlación por traceId | sí |
