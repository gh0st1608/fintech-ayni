# Plan de implementación — Pantallas pendientes de diseño (D1–D16)

Estado: **aprobado** (11 de noviembre de 2026). Issues en Jira: COPAYNI-75 a COPAYNI-91 (§7). Implementa las propuestas de diseño **aprobadas** con sus supuestos, en la sección "Propuestas D1–D16" del Figma (`wu18eeCY4284Te2ITa8W5X`, página Screens). Cubre los pendientes D1–D8, D11, D12, D15 y D16 de [pending-scope.md](pending-scope.md).

Convención: **[H]** hecho observado (código, Figma, Jira), **[I]** inferencia técnica, **[?]** decisión pendiente. Estimaciones en story points (Fibonacci), sin convertir a horas: no hay velocidad histórica fiable.

## 1. Resumen

- **Alcance:** 14 pantallas aprobadas en Figma, agrupadas en 15 historias. 5 extienden pantallas que ya existen en la app; el resto son nuevas.
- **Total estimado:** **90 SP** (fase A: 48 SP; fase B: 42 SP), con confianza **media** en la fase A y **baja** en la fase B.
- **Se puede empezar ya:** la fase A no depende de proveedores ni de Legal.
- **Bloqueos de la fase B:** el proveedor de payouts (T5) para _usar_ la cuenta de cobro, el texto del contrato y del pagaré (Legal, L1 y L4), y las cuentas de Google y Apple para el login social.

## 2. Qué existe hoy

| Ítem                                 | App (mobile) [H]                                                              | Backend [H]                                                                                                                                    | Jira [H]                     |
| ------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| D1 Pagar cuota                       | `PayInstallmentScreen` con Yape y tarjeta, resultado simple                   | `POST /v1/me/installments/:id/pay` (Yape con Orders, tarjeta)                                                                                  | COPAYNI-63 Listo             |
| D2 Confirmar unión                   | `JoinConfirmScreen` con resumen y aviso de retención                          | `POST /v1/circles/join`; la cotización ya trae `retention`                                                                                     | COPAYNI-31 Listo             |
| D3 Contrato y pagaré                 | —                                                                             | —                                                                                                                                              | —                            |
| D4 Cuenta de cobro                   | `PayoutMethodScreen` y `ChangePayoutMethodScreen`: solo el **tipo** de método | `GET/PUT /v1/me/payout-method`: tipos `digital_wallet`, `prepaid_card`, `bank_transfer`, `fawry` (del Figma de Marruecos), sin datos de cuenta | COPAYNI-37 Listo             |
| D5 Ahorro: confirmar y primer aporte | `SavingCirclesScreen` (planes y duración)                                     | `GET /v1/savings/plans` y `/quote`; **sin suscripción** (el puerto de la app la anuncia como D5)                                               | COPAYNI-33 Listo (sin cobro) |
| D6 Notificaciones                    | La campana del header no lleva a nada                                         | —                                                                                                                                              | —                            |
| D7 Ayuda y política                  | Accesos sin destino en Payment                                                | —                                                                                                                                              | —                            |
| D8 Detalle de círculo                | `CirclesScreen` (lista)                                                       | Solo el detalle del back-office (`admin/v1/circles/:id`)                                                                                       | COPAYNI-66 (back-office)     |
| D8 Detalle de transacción            | `PaymentHistoryScreen` (lista)                                                | `GET /v1/me/transactions` (lista)                                                                                                              | COPAYNI-41 Listo             |
| D11 Icono de fuego                   | Icono sin acción                                                              | —                                                                                                                                              | —                            |
| D12 Login social                     | Solo email o teléfono con OTP                                                 | `POST /v1/auth/start` y `/verify`                                                                                                              | —                            |
| D15 Marca                            | Nombre como texto; `assets/icon.png` y splash por defecto de Expo             | —                                                                                                                                              | COPAYNI-18 Listo             |
| D16 Payout Amount                    | `PayoutAmountScreen` con un único aviso                                       | Rango y salto desde `join-config`                                                                                                              | COPAYNI-28 Listo             |

## 3. Supuestos aprobados que fija este plan

Aprobados con las propuestas de Figma; se vuelven reglas de implementación:

1. **D1:** la cuota vence el día `CIRCLE_INSTALLMENT_DUE_DAY` con 3 días de gracia. Si la cuota supera el tope de Yape, se avisa y se sugiere la tarjeta. El recibo muestra el id de operación de Mercado Pago. Un pago `pending` bloquea un segundo intento.
2. **D2:** la aceptación de los términos guarda la versión y la fecha. "Confirmar y firmar" lleva a D3; la unión **no** queda firme hasta firmar.
3. **D3:** firma electrónica simple con OTP al celular, guardando la evidencia (hash del documento, versión, fecha, IP y dispositivo). El PDF firmado queda en Mis documentos.
4. **D4:** cuenta bancaria por **CCI** (20 dígitos) o billetera Yape/Plin, siempre **a nombre del titular** (mismo DNI que el KYC) y en la moneda del círculo. Se puede cambiar hasta el corte antes del mes de cobro (regla existente de COPAYNI-37).
5. **D5:** el primer aporte se cobra al confirmar; los siguientes, el mismo día de cada mes con débito automático. El retiro anticipado devuelve lo ahorrado **sin** cashback.
6. **D6:** tipos de notificación: cuota por vencer (3 días antes y el día), pago recibido o fallido, turno de cobro, documento aprobado o rechazado y cambios del círculo. La campana muestra un punto si hay no leídas.
7. **D7:** las FAQ y la política de pagos se sirven desde el backend, para cambiarlas sin publicar la app. Soporte por WhatsApp (enlace `wa.me`) y chat.
8. **D8:** los nombres de los demás miembros se muestran abreviados (María R.).
9. **D11:** el fuego es la **racha de cuotas pagadas a tiempo**. Pagar en la gracia no la rompe; la mora sí. La racha alimenta la regla de confianza (R18).
10. **D12:** login con Google y Apple (Apple es obligatorio en iOS si hay otro login social). La primera vez se pide además el OTP del celular.
11. **D15:** wordmark "ayni" en Outfit SemiBold sobre `#3051BB`; el icono es la "a" del wordmark. Reemplaza "Dart" en toda la app.
12. **D16:** carrusel de 3 tarjetas y una hoja "¿Cómo funciona un Game'ya?". Se quita el 20 % de cashback, que es del ahorro.

## 4. Historias

Cada historia incluye app, backend si aplica, i18n (`es` y `en`), estados de carga, error y vacío, tests unitarios y de componentes, e2e del backend si hay endpoint, y la documentación de la API. Ninguna marca historias anteriores como reabiertas: se enlazan con "relates to".

### Fase A — sin dependencias externas (48 SP)

| ID  | Historia                                                        | Alcance                                                                                                                                                                                                                                                                    | SP  | Depende de                                                     |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------- |
| A1  | **D15** Ver la marca Ayni en la app                             | Componente `Wordmark`; reemplazar "Dart" en headers, bienvenida y login; icono adaptativo (Android) y monocromo (iOS) y splash nativo en `app.json` (requiere un development build nuevo)                                                                                  | 3   | Arte final del icono en 1024 px [?]                            |
| A2  | **D1** Pagar la cuota con guía, recibo y reintento              | Rediseño del resumen (vencimiento, turno, círculo); ayuda del código de Yape; aviso de tope de Yape; recibo con id de operación y fecha; pago fallido con el motivo traducido y reintento con otro método. Backend: la respuesta del pago incluye `operationId` y `paidAt` | 5   | —                                                              |
| A3  | **D2** Confirmar la unión aceptando los términos                | Resumen del Figma; casilla de términos; backend: guardar `termsVersion` y `acceptedAt` en la unión. Navega a D3 cuando B3 exista (por ahora, termina como hoy)                                                                                                             | 3   | —                                                              |
| A4  | **D16** Entender el Game'ya antes de elegir el monto            | Carrusel de 3 tarjetas y hoja "¿Cómo funciona?" con un ejemplo en PEN; quitar el cashback                                                                                                                                                                                  | 3   | Textos finales [?]                                             |
| A5  | **D8** Ver el detalle de mi círculo                             | Backend: `GET /v1/me/circles/:id` (pozo, progreso, mi turno y cuota, próximo vencimiento, turnos con nombres abreviados y estado). App: pantalla y navegación desde Circles y Home; acceso a pagar la cuota del mes                                                        | 8   | —                                                              |
| A6  | **D8** Ver el detalle de una transacción                        | Backend: `GET /v1/me/transactions/:id`. App: detalle con signo y color del movimiento, desglose (pozo, retención, recibido) y copiar el número de operación                                                                                                                | 3   | —                                                              |
| A7  | **D5** Suscribirme a un plan de ahorro y pagar el primer aporte | Backend: `POST /v1/savings/subscriptions` (idempotente), primer cobro con tarjeta por `PaymentGatewayPort`, débito automático mensual en la tarea diaria y estado de la suscripción. App: confirmación, pago y resultado                                                   | 8   | Automatic Payments de Mercado Pago para el débito (T3) [?]     |
| A8  | **D11** Ver mi racha de pagos a tiempo                          | Backend: calcular la racha (cuotas consecutivas pagadas hasta el fin de la gracia) y exponerla en `GET /v1/me`. App: número junto al fuego y hoja de la racha                                                                                                              | 5   | —                                                              |
| A9  | **D7** Encontrar ayuda y la política de pagos                   | Backend: `GET /v1/help` (FAQ y política versionadas, por idioma). App: búsqueda, FAQ desplegables, política y contacto por WhatsApp                                                                                                                                        | 5   | Texto de la política aprobado por Legal (L4) para publicar [?] |
| A10 | **D8** Descargar el comprobante                                 | Backend: PDF del comprobante de pago o payout. App: compartir o guardar el PDF                                                                                                                                                                                             | 5   | —                                                              |

### Fase B — con dependencias externas (42 SP)

| ID  | Historia                                          | Alcance                                                                                                                                                                                                                                            | SP  | Depende de                                                                          |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------- |
| B1  | **D4** Registrar la cuenta donde recibo el payout | Backend: cuenta bancaria (banco, tipo, CCI con dígitos de control, titular) o billetera (celular), cifrada y enmascarada; validar el titular contra el KYC; reemplazar los tipos del Figma de Marruecos por los de Perú. App: formulario del Figma | 8   | Proveedor de payouts (T5) solo para **pagar**; registrar la cuenta no depende de él |
| B2  | **D6** Ver mis notificaciones en la app           | Backend: tabla y `GET /v1/me/notifications`, marcar como leídas y contador de no leídas; los eventos del ciclo, de pagos y de KYC crean notificaciones. App: bandeja con pestañas y punto en la campana                                            | 8   | —                                                                                   |
| B3  | **D6** Recibir notificaciones push                | `expo-notifications` (development build), registro del token del dispositivo, envío por Expo Push Service y preferencias de notificación                                                                                                           | 5   | Proveedor de push (T7): se propone Expo Push Service [?]                            |
| B4  | **D3** Firmar el contrato y el pagaré             | Backend: plantillas versionadas en PDF, firma con OTP y evidencia, unión en estado "pendiente de firma" hasta firmar y PDF firmado en Mis documentos. App: lectura de los documentos y firma                                                       | 13  | Texto del contrato y del pagaré y validación de Legal (L1, L4, T9)                  |
| B5  | **D12** Ingresar con Google o Apple               | Backend: validar los id tokens de Google y Apple (OIDC), vincularlos al usuario y pedir el OTP del celular la primera vez. App: `expo-apple-authentication` y el login de Google (development build)                                               | 8   | Cuentas de Google Cloud y de Apple Developer [?]                                    |

## 5. Orden propuesto

| Sprint [I] | Historias      | SP  | Motivo                                                                     |
| ---------- | -------------- | --- | -------------------------------------------------------------------------- |
| 1          | A1, A2, A3, A4 | 14  | Afinan pantallas existentes y la marca: poco riesgo y alto impacto visible |
| 2          | A5, A6, A8     | 16  | Detalles y racha: endpoints nuevos de solo lectura                         |
| 3          | A7, A9, A10    | 18  | Suscripción al ahorro (cobro) y contenido de ayuda                         |
| 4          | B1, B2         | 16  | Cuenta de cobro y bandeja de notificaciones                                |
| 5          | B3, B4, B5     | 26  | Dependen de cuentas de proveedores y del texto de Legal                    |

- **En paralelo:** dentro de cada sprint las historias no dependen entre sí, salvo A6 → A10 (el comprobante usa el detalle).
- **Dependencia entre fases:** A3 queda completa en B4: el botón "Confirmar y firmar" navega a la firma.
- **Development builds:** A1, B3 y B5 cambian la configuración nativa: conviene agruparlos en el menor número de builds de EAS.

## 6. Riesgos

| Riesgo                                                                | Impacto                                   | Mitigación                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| Legal tarda el contrato y el pagaré                                   | B4 bloqueada; la unión sigue sin firma    | La fase A no depende de B4; A3 deja el punto de extensión listo                |
| Mercado Pago no habilita Automatic Payments                           | A7 sin débito automático                  | Cobrar el aporte mensual desde la app como la cuota (D1)                       |
| Cambiar los tipos de método de cobro (B1) afecta a usuarios de prueba | Datos de prueba inconsistentes            | Migración que mapea `bank_transfer` y `digital_wallet`; los demás se descartan |
| La racha (A8) se usa para la regla de confianza                       | Cambia quién accede a los primeros turnos | Mostrarla primero solo informativa; conectarla a R18 en una decisión aparte    |
| Login social sin OTP inicial                                          | Cuentas sin teléfono verificado           | Pedir el OTP del celular la primera vez (supuesto aprobado)                    |

## 7. Issues en Jira

Plan aprobado por el PO el 11 de noviembre de 2026; los issues se crearon y verificaron ese día. Todos llevan la etiqueta `diseno-aprobado-d`, criterios de aceptación Given/When/Then, story points y el enlace al frame de Figma. No se modificó ningún issue existente.

| Plan | Issue                                                | Épica      | SP  |
| ---- | ---------------------------------------------------- | ---------- | --- |
| —    | COPAYNI-75 (épica) Pagos y cobros v2                 | —          | —   |
| —    | COPAYNI-76 (épica) Comunicación con el usuario       | —          | —   |
| A1   | COPAYNI-90 Marca Ayni                                | COPAYNI-1  | 3   |
| A2   | COPAYNI-77 Pagar la cuota con guía y recibo          | COPAYNI-75 | 5   |
| A3   | COPAYNI-86 Confirmar la unión aceptando los términos | COPAYNI-3  | 3   |
| A4   | COPAYNI-87 Cómo funciona un Game'ya                  | COPAYNI-3  | 3   |
| A5   | COPAYNI-88 Detalle del círculo                       | COPAYNI-3  | 8   |
| A6   | COPAYNI-78 Detalle de una transacción                | COPAYNI-75 | 3   |
| A7   | COPAYNI-79 Suscripción al ahorro                     | COPAYNI-75 | 8   |
| A8   | COPAYNI-82 Racha de pagos                            | COPAYNI-76 | 5   |
| A9   | COPAYNI-83 Ayuda y política de pagos                 | COPAYNI-76 | 5   |
| A10  | COPAYNI-80 Comprobante en PDF                        | COPAYNI-75 | 5   |
| B1   | COPAYNI-81 Cuenta de cobro                           | COPAYNI-75 | 8   |
| B2   | COPAYNI-84 Bandeja de notificaciones                 | COPAYNI-76 | 8   |
| B3   | COPAYNI-85 Notificaciones push                       | COPAYNI-76 | 5   |
| B4   | COPAYNI-89 Contrato y pagaré                         | COPAYNI-3  | 13  |
| B5   | COPAYNI-91 Login con Google o Apple                  | COPAYNI-1  | 8   |

Enlaces:

- **Blocks:** COPAYNI-78 → 80, COPAYNI-84 → 85 y COPAYNI-86 → 89.
- **Relates:** 77–63, 78–41, 79–33, 81–37, 86–31, 87–28 y 90–18.

## 8. Resumen de estimaciones

| Agrupación | SP     | Confianza  |
| ---------- | ------ | ---------- |
| Fase A     | 48     | Media      |
| Fase B     | 42     | Baja       |
| **Total**  | **90** | Baja-media |

Pueden cambiar la estimación: el alcance legal del contrato (B4), el CCI y la validación del titular (B1) y la configuración nativa de los proveedores de login y push (B3, B5).
