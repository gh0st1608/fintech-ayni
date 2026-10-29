# Alcance pendiente para completar el producto — Ayni

Este documento recoge lo que **falta definir, diseñar o decidir** para completar el alcance. El backlog creado en Jira (ver [backlog-analysis.md](backlog-analysis.md)) cubre solo lo respaldado por el Figma. Lo de aquí **no tiene issues** hasta que exista diseño o una decisión.

Responsables sugeridos: **PO** = Product Owner / negocio, **UX** = diseño, **TL** = tech lead / arquitectura, **Legal** = cumplimiento.

## 1. Moneda e idioma (decisión transversal)

El Figma está localizado para Marruecos/Egipto (MAD, árabe, Fawry). El backlog ya obliga a que **ni la moneda ni los textos estén hardcodeados**:

- **Idiomas:** la app usa archivos JSON por idioma (`apps/mobile/src/presentation/i18n/locales/<código>.json`). Agregar un idioma = agregar un JSON y registrarlo en el catálogo (COPAYNI-16; selector en COPAYNI-50).
- **Moneda:** value object `Money { amount en unidades menores, currency ISO 4217 }` en el dominio, moneda por defecto en configuración, formato con `Intl.NumberFormat` (COPAYNI-17).

| #   | Pendiente                                                                                                         | Responsable | Propuesta                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| M1  | Moneda oficial de operación                                                                                       | PO          | PEN (sol peruano)                                                                                  |
| M2  | ¿Se aceptan varias monedas (PEN y USD)? ¿Un círculo puede ser en USD?                                             | PO          | Una sola moneda por círculo; empezar solo con PEN                                                  |
| M3  | Idioma por defecto y lista de idiomas del MVP                                                                     | PO          | `es` por defecto, `en` secundario; quechua o aimara a evaluar; árabe descartado salvo confirmación |
| M4  | Traducción de todos los textos del Figma al español y revisión de tono                                            | UX / PO     | Generar `es.json` a partir de los textos del Figma                                                 |
| M5  | Corregir en el diseño los montos que están en MAD y USD (incoherencia 150 USD / 150 MAD)                          | UX          | Usar la moneda de M1                                                                               |
| M6  | Rangos de montos en la nueva moneda (payout 3.000–120.000, ahorro hasta 1.000.000, prepaid 100.000, referido 150) | PO          | Recalcular según el mercado objetivo                                                               |

## 2. Pantallas y flujos sin diseño

| #   | Pendiente                                                                                                                                                             | Por qué es necesario                                                                                                                                                                                                                                                                | Responsable  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| D1  | **Pago de la cuota mensual (pay-in):** cuotas pendientes, pagar con tarjeta guardada, confirmación, recibo, pago fallido                                              | Núcleo financiero; sin esto el círculo no funciona                                                                                                                                                                                                                                  | UX / PO      |
| D2  | Pantalla de **confirmación de unión** al Game'ya (resumen, aceptar términos)                                                                                          | El User Flow la incluye ("Confirm"), pero no existe la pantalla                                                                                                                                                                                                                     | UX           |
| D3  | **Firma del contrato y del pagaré de seguro** (Insurance Note)                                                                                                        | El checklist de elegibilidad los exige                                                                                                                                                                                                                                              | UX / Legal   |
| D4  | **Add Account:** datos de la cuenta bancaria o wallet para recibir el payout                                                                                          | El User Flow la incluye, pero no hay diseño                                                                                                                                                                                                                                         | UX           |
| D5  | Paso posterior a "Next" en el **programa de ahorro** (confirmación y primer pago)                                                                                     | El flujo termina sin destino                                                                                                                                                                                                                                                        | UX           |
| D6  | **Notificaciones:** bandeja, tipos (cuota por vencer, turno de cobro, documento aprobado) y push                                                                      | La campana aparece en todas las pantallas                                                                                                                                                                                                                                           | UX / PO      |
| D7  | **Payment Policy, Help / Get Help** (contenido, FAQ, canal de soporte)                                                                                                | Hay accesos, pero no pantallas                                                                                                                                                                                                                                                      | UX / PO      |
| D8  | **Detalle** de círculo, de círculo finalizado y de transacción                                                                                                        | Los chevrons no llevan a ningún destino                                                                                                                                                                                                                                             | UX           |
| D9  | Flujos de **passcode** (crear, cambiar, recuperar) y activación de **biometría**                                                                                      | Menús visibles sin flujo (historias H2.5/H2.6 marcadas `pendiente-diseno`)                                                                                                                                                                                                          | UX / PO      |
| D10 | Estados de **error y carga** por pantalla (sin red, sesión expirada, documento rechazado)                                                                             | Solo están diseñados algunos estados vacíos                                                                                                                                                                                                                                         | UX           |
| D11 | Significado y comportamiento del **icono de fuego** del header                                                                                                        | Sin definir                                                                                                                                                                                                                                                                         | PO / UX      |
| D12 | **Login social** (el texto lo menciona, pero no hay botones)                                                                                                          | Decidir si entra o se elimina el texto                                                                                                                                                                                                                                              | PO           |
| D13 | **Back-office** de administración: crear y operar círculos, validar KYC, conciliar pagos, gestionar ofertas y metas                                                   | Sin él no se puede operar el producto                                                                                                                                                                                                                                               | PO / UX / TL |
| D14 | **Selector de país** del teléfono en el login y en el Perfil                                                                                                          | Sin él, el login exige el formato internacional (+51…); el campo Email/Phone del Figma no indica país (COPAYNI-19)                                                                                                                                                                  | UX / PO      |
| D16 | **Payout Amount:** contenido del carrusel informativo y destino de "Learn More"; ilustraciones de "Elige un servicio"; textos del paso 1; porcentaje de cashback (R6) | "Elige un servicio" ya usa el título y los textos del Figma (55:9069), pero con iconos en lugar de las ilustraciones y sin el 20% de cashback. Payout Amount muestra un único aviso sin "Learn More": no se pudo obtener el diseño por el límite de la integración (COPAYNI-27, 28) | UX / PO      |
| D15 | **Marca final** (Figma dice "Dart", el producto es Ayni): logo, icono de la app e imagen del splash nativo                                                            | Hoy se muestra el nombre como texto y el splash usa el icono por defecto de Expo (COPAYNI-18)                                                                                                                                                                                       | PO / UX      |

## 3. Reglas de negocio por confirmar

| #   | Pregunta                                                                                                                                                                                                                                                                                                                                                                              | Afecta a         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R1  | Fórmula de **fees de los primeros slots** y **descuentos de los últimos**. **Confirmado por el PO (cualitativo):** la cuota mensual varía según el fee o el descuento del turno. **Pendiente:** porcentajes y cómo bajan de un turno a otro. Implementado con parámetros y una fórmula lineal provisional (`SlotPricingRules`, README del backend)                                    | T3.1, H3.6       |
| R2  | Cómo se **forman los círculos** (admin o automático), número de miembros, qué pasa si no se llenan. Implementado con una regla provisional configurable (`CIRCLE_ASSIGNMENT_STRATEGY`, [circles.md](api/circles.md))                                                                                                                                                                  | T3.1, H3.1, H3.7 |
| R3  | **Mora e impago.** **Decidido por el PO:** gracia, expulsión, bloqueo, devolución, reemplazo del turno, fondo de garantía y pausa; ver la [sección 3.1](#31-ciclo-del-círculo-y-mora-decisiones-del-po). **Pendiente:** aprobar los valores de R18 y los puntos marcados [?]                                                                                                          | T3.1, D1, D3     |
| R4  | ¿Las **Admin Fees** se suman a la cuota o se descuentan del payout? **Resuelto por el PO:** se reparten entre las cuotas hasta el mes de cobro (`adminFeeMode=added_to_installments`, el valor por defecto). **Pendiente:** el porcentaje (hoy 12 % provisional, `ADMIN_FEE_BPS`) y si "proporcionalmente" significa algo distinto de partes iguales                                  | T3.1, H3.5       |
| R5  | Fórmula del **límite mensual de pay-in** según ingresos y documentos. **Confirmado por el PO:** el límite se calcula con el ingreso mensual. **Pendiente:** la fórmula y cuánto suben el límite los demás documentos. La unión (COPAYNI-31) usa un límite provisional igual para todos (`JOIN_MONTHLY_PAYIN_LIMIT`, sin límite por defecto; [circles.md](api/circles.md))             | H6.1, H6.5, H3.7 |
| R6  | Fórmula del **cashback** del ahorro (el diseño muestra 20% y 5%) y nombres de los planes                                                                                                                                                                                                                                                                                              | H4.1, H4.2       |
| R7  | Reglas de **referidos:** tope de invitaciones, expiración del saldo, moneda                                                                                                                                                                                                                                                                                                           | H7.1–H7.3        |
| R8  | ¿Cuándo se puede **cambiar el método de cobro** y qué pasa con los payouts en curso?                                                                                                                                                                                                                                                                                                  | H5.3             |
| R9  | ¿Cambiar teléfono o email exige **re-verificación OTP**?                                                                                                                                                                                                                                                                                                                              | H6.2             |
| R10 | Política de **OTP:** duración, intentos y reenvíos; comportamiento de "Remember Me"                                                                                                                                                                                                                                                                                                   | H2.3             |
| R11 | Qué **documentos** son obligatorios y cuáles opcionales; verificación manual o automática; vigencia                                                                                                                                                                                                                                                                                   | H6.3–H6.6        |
| R12 | **Nombres de los planes de ahorro:** ¿el backend los envía ya traducidos o como claves para los JSON de idioma?                                                                                                                                                                                                                                                                       | COPAYNI-32       |
| R13 | **"Remember Me":** confirmar que, sin marcar, la sesión vive solo en memoria y termina al cerrar la app (implementado así en mobile, marcado por defecto como en el Figma)                                                                                                                                                                                                            | COPAYNI-20       |
| R15 | **Salto del slider de payout:** de cuánto en cuánto se elige el monto (mobile usa 500 provisional, configurable desde el backend)                                                                                                                                                                                                                                                     | COPAYNI-28       |
| R14 | **Biometría:** confirmar el nuevo estado de sesión `locked` y cuándo se vuelve a pedir al volver de background                                                                                                                                                                                                                                                                        | COPAYNI-22       |
| R16 | **Origen del seguro. Decidido:** fondo de garantía propio con un porcentaje de las Admin Fees; póliza externa más adelante si el volumen lo justifica. **Pendiente:** capital semilla y validación de Legal (L1). Ver la [sección 3.1](#31-ciclo-del-círculo-y-mora-decisiones-del-po)                                                                                                | R3, D3, L1       |
| R17 | **Turno del expulsado. Decidido:** lo puede tomar un miembro nuevo dentro del plazo del pago mensual; si nadie lo toma, se ajusta. **Propuesto:** quien lo toma se pone al día con lo vencido hasta su mes de cobro, el fondo cubre los meses sin reemplazo y el pozo se reduce solo si el fondo no tiene saldo. Ver la [sección 3.1](#31-ciclo-del-círculo-y-mora-decisiones-del-po) | R3, R2           |
| R18 | **Valores iniciales del esquema de mora y riesgo:** propuestos (cargo por mora, regla de confianza, retención, aporte al fondo, saldo mínimo, capital semilla). **Pendiente:** aprobación del PO y tope legal del cargo por mora. Ver la [sección 3.1](#31-ciclo-del-círculo-y-mora-decisiones-del-po)                                                                                | R3               |

### 3.1 Ciclo del círculo y mora (decisiones del PO)

**Workflow ROSCA (referencia del PO):** cada círculo pasa por `Collecting Applications`, luego un ciclo mensual `Contributing → Checking → Setting Receiver → Distributing → Distributed`, y termina en `Finished` cuando todos cobraron. Desde cualquier estado puede pasar a `Paused` y volver. Hoy el backend solo distingue círculo abierto o lleno, y activo o finalizado por fechas: este ciclo **no está implementado** y es la base de D1 (pay-in) y de los payouts.

"Volver a Collecting" se interpreta como **empezar la siguiente ronda de pagos**, no reabrir solicitudes, porque el turno es fijo desde la unión. **[?]**

**Impago (decidido):**

| Regla                 | Decisión del PO                                                                                                 | Parámetro (back-office)                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Gracia                | 3 días **corridos** desde la fecha de vencimiento, en `BUSINESS_TIME_ZONE`                                      | Días de gracia                            |
| Expulsión             | Al vencer la gracia sin pago, el miembro sale del círculo                                                       | —                                         |
| Bloqueo               | No puede unirse a otro círculo hasta pagar lo vencido **más un cargo por mora**                                 | Cargo por mora                            |
| Devolución            | Si se le expulsa **antes de su turno**, se le devuelven las cuotas pagadas con una penalidad mínima del **5 %** | Porcentaje de penalidad (por defecto 5 %) |
| Turno del expulsado   | Lo puede tomar un **miembro nuevo**; si nadie lo toma, cubre el fondo de garantía (ver más abajo)               | Ventana de reemplazo                      |
| Cobertura de su parte | **Fondo de garantía propio** (R16)                                                                              | Aporte al fondo                           |

Propuesta para cuidar la caja **[?]**: devolver las cuotas del expulsado **al cerrar el círculo** y no al expulsarlo. Así el dinero sigue sirviendo al pozo mientras el círculo está en curso, y el balance del fondo de abajo cierra.

**Origen del seguro (R16, decidido):** **fondo de garantía propio** para el MVP, alimentado con un porcentaje de las Admin Fees. Más adelante, si el volumen lo justifica, se evalúa una póliza externa (crédito o caución) o un esquema mixto. Legal debe validar que el fondo no sea un seguro regulado (L1).

- **Capital semilla [?]:** el fondo empieza en cero y se llena con las cuotas. Los primeros meses necesitan un aporte inicial de la cooperativa; el monto lo decide el PO (sugerencia en R18).
- La regla "mayoría de nuevos, 80 %" queda **sin efecto**: con el fondo propio, el fondo siempre cubre primero.

**Turno del expulsado (R17, decidido el criterio, recomendación técnica en el detalle):**

1. **Vacante.** Al expulsar a un miembro que todavía no cobró, su turno queda vacante y se ofrece a **miembros nuevos**. La vacante aparece en los recomendados de Home (COPAYNI-25), que hoy solo muestran círculos sin empezar.
2. **Ventana.** Se puede tomar hasta la fecha de vencimiento de cada mes. La vacante se sigue ofreciendo mes a mes mientras no haya vencido el mes de cobro de ese turno.
3. **Quién la toma paga la puesta al día de lo ya vencido.** Las cuotas de los meses ya transcurridos se reparten entre sus cuotas **hasta su mes de cobro**, igual que las Admin Fees. Así su riesgo es el mismo que tenía el miembro original de ese turno. Lo que paga de más va al fondo.
4. **Mismas reglas de unión.** Debe cumplir el límite mensual (R5) y la regla de confianza del tipo de turno (R18). Si la cuota con la puesta al día supera su límite, no puede tomarlo.
5. **Mes sin reemplazo.** El **fondo cubre** la cuota que falta y quien cobra ese mes recibe el payout completo, como se le prometió.
6. **Mes de cobro sin reemplazo.** Si llega el mes de cobro del turno vacante, ese pozo **no se paga a nadie y vuelve al fondo**.
7. **Último recurso.** El pozo de un mes se reduce **solo si el fondo no tiene saldo** para cubrir la cuota que falta. Se avisa al miembro que cobra ese mes y se le paga la diferencia cuando el fondo se recupere **[?]**.
8. **Si el expulsado ya había cobrado,** no hay vacante: el fondo cubre sus cuotas restantes y se activa la recuperación (retención, pagaré, cobranza).

Con estas reglas el fondo **no pierde** cuando el expulsado no había cobrado. Ejemplo sin fees ni descuentos: payout de 30.000 en 10 meses (cuota base de 3.000), expulsado en el turno 7 después de pagar 4 cuotas.

| Caso                         | Sale del fondo                           | Entra al fondo                           | Devolución al expulsado (al cerrar) | Resultado del fondo |
| ---------------------------- | ---------------------------------------- | ---------------------------------------- | ----------------------------------- | ------------------- |
| Nadie toma el turno          | 6 cuotas cubiertas (meses 5–10) = 18.000 | Pozo del mes 7 sin destinatario = 30.000 | 4 × 3.000 × 95 % = 11.400           | **+600**            |
| Un nuevo lo toma en el mes 6 | 1 cuota cubierta (mes 5) = 3.000         | Puesta al día de los meses 1–5 = 15.000  | 11.400                              | **+600**            |

En los dos casos el fondo gana la penalidad de 5 %. El riesgo es de **liquidez**, no de pérdida: en el primer caso el fondo adelanta 6.000 (meses 5 y 6) antes de recuperar en el mes 7. Con fees y descuentos los montos cambian un poco, y la diferencia la absorbe el fondo.

**Moroso que ya cobró (decidido: esquema por capas):**

1. **Prevención:**
   - **Turnos según confianza:** los primeros turnos (Fastest Payout) solo para quien ya completó un círculo sin expulsión (R18).
   - **Débito automático:** la cuota se cobra a la tarjeta guardada en la fecha de vencimiento, con reintentos durante la gracia (T3).
   - **Límite mensual:** se calcula con el ingreso (R5).
2. **Mitigación:** a quien cobra en la primera mitad del círculo se le **retiene parte del payout**, que paga automáticamente sus últimas cuotas. Usa el mecanismo de "Deduct pay-in from payout" del Figma. La retención se muestra en la confirmación de unión (D2) **antes** de unirse.
3. **Recuperación:**
   - Primero se aplica la retención a la deuda.
   - El fondo cubre lo que falte para que el pozo no se reduzca.
   - Después: pagaré firmado al unirse (D3), bloqueo de la cuenta y cobranza. Lo recuperado vuelve al fondo.
   - El reporte a centrales de riesgo depende de L1.
4. **Descartado:** el fondo de garantía al registrarse. Castiga a todos los usuarios y retener dinero del público sin un fin específico puede ser captación regulada (L1).

**Valores iniciales (R18, estimación técnica).** Confianza **baja a media**: no hay datos de mora reales. Revisar cada mes con la tasa de mora observada y ajustar desde el back-office.

| Parámetro                        | Valor inicial                                                                                     | Razonamiento                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Días de gracia                   | 3 corridos                                                                                        | Decidido por el PO                                                                                                                                |
| Reintentos del débito automático | Día del vencimiento, día 1 y día 3 de la gracia                                                   | El último reintento es antes de expulsar; más intentos suben el costo de la pasarela sin mucho beneficio                                          |
| Cargo por mora                   | 3 % de la cuota vencida, cargo único, sin interés diario                                          | Disuade sin volver impagable la deuda. **Legal debe verificar el tope legal del interés moratorio** (BCRP) antes de fijarlo                       |
| Penalidad de devolución          | 5 %                                                                                               | Decidido por el PO (mínimo)                                                                                                                       |
| Definición de "nuevo"            | 0 círculos completados sin expulsión                                                              | Es el único dato de comportamiento de pago que tendrá la app                                                                                      |
| Fastest Payout                   | Requiere al menos **1 círculo completado sin expulsión**                                          | El que cobra primero es el de mayor riesgo; los ingresos declarados no prueban que pague                                                          |
| Lowest Fees (intermedios)        | Identidad verificada e ingreso declarado                                                          | Riesgo medio, cubierto por la retención si está en la primera mitad                                                                               |
| Highest Return (últimos)         | Identidad verificada                                                                              | Casi sin riesgo: cuando cobra ya pagó casi todo                                                                                                   |
| Retención del payout             | **2 cuotas base**, solo en los turnos de la primera mitad; pagan las 2 últimas cuotas del círculo | Cubre la cuota impaga más la siguiente. Ej.: payout de 30.000 en 10 meses, turno 3: recibe 24.000 y sus cuotas de los meses 9 y 10 quedan pagadas |
| Aporte al fondo                  | **25 % de las Admin Fees**                                                                        | Con Admin Fees de 12 %: 3 % del payout por miembro (900 de 30.000). En un círculo de 10, 9.000 por círculo                                        |
| Saldo mínimo del fondo (alerta)  | 2 cuotas base por círculo activo                                                                  | Supone hasta 2 vacantes cubiertas a la vez por círculo. Bajo ese umbral se alerta al admin general                                                |
| Capital semilla                  | El saldo mínimo de los círculos previstos para los 3 primeros meses                               | Cubre la liquidez mientras el aporte de las Admin Fees acumula saldo                                                                              |
| Desbloqueo                       | Automático al pagar lo vencido más el cargo por mora                                              | Manual solo desde el back-office con 4-eyes                                                                                                       |

Lectura del aporte al fondo: un moroso que cobró en el turno 3 de ese ejemplo deja una deuda de 21.000. La retención cubre 6.000 y el fondo los 15.000 restantes, unos 1,7 círculos de aporte. Con la regla de confianza este caso debería ser raro; si la mora real lo contradice, se sube el aporte o la retención.

**Pausa (decidido):** solo el **admin general** de la app puede pausar y reanudar un círculo. Ese rol tiene los accesos privilegiados del back-office ([backoffice-plan.md](backoffice-plan.md)). Recomendación técnica para los efectos de la pausa **[?]**:

- Mientras dura la pausa no corren vencimientos, débitos automáticos, expulsiones ni payouts.
- Las cuotas que vencían durante la pausa se mueven a la fecha en que se reanuda.
- Si la pausa pasa a otro mes, el calendario del círculo se corre un mes, `endsOn` incluido, y se notifica a los miembros.
- El motivo es obligatorio y queda en la auditoría.

## 4. Decisiones técnicas y de proveedores

| #   | Decisión                                                                                                                                                                | Issue relacionado |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| T1  | Despliegue: AWS Lambda + API Gateway o contenedores (ECS/Fargate). **Propuesto: ECS Fargate** ([architecture.md](architecture.md)), pendiente de aprobación             | T1.4 (spike)      |
| T2  | Base de datos (relacional recomendada por la naturaleza transaccional). **Propuesto: RDS for PostgreSQL** ([architecture.md](architecture.md)), pendiente de aprobación | T1.4 (spike)      |
| T3  | Pasarela de pago y tokenización (PCI-DSS) disponible en el país                                                                                                         | T5.1 (spike)      |
| T4  | Proveedor de verificación de identidad y OCR                                                                                                                            | T6.1 (spike)      |
| T5  | Proveedores de payout: bancos, wallets locales (p. ej. Yape/Plin si es Perú), prepago                                                                                   | H5.3, D4          |
| T6  | Proveedor de envío de OTP (SMS y email)                                                                                                                                 | H2.2              |
| T7  | Proveedor de push notifications                                                                                                                                         | D6                |
| T8  | Crash reporting y telemetría mobile                                                                                                                                     | T1.6              |
| T9  | Firma electrónica de contrato y pagaré                                                                                                                                  | D3                |

## 5. Cumplimiento y legal

| #   | Pendiente                                                                                                                       | Responsable |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| L1  | Regulador aplicable (el diseño cita "Central Bank"; en Perú, SBS/UIF) y si la cooperativa requiere licencia para esta operativa | Legal       |
| L2  | Requisitos KYC/AML (prevención de lavado de activos): documentos, listas restrictivas, monitoreo                                | Legal / TL  |
| L3  | Protección de datos personales (Ley 29733 en Perú): consentimiento, retención y derechos ARCO                                   | Legal       |
| L4  | Textos de Términos de Uso y Política de Privacidad                                                                              | Legal       |
| L5  | Retención y eliminación de documentos KYC                                                                                       | Legal / TL  |

## 6. Correcciones al Figma

1. Unificar la moneda del banner de referidos (150 USD frente a 150 MAD).
2. Renombrar los planes "Silver Saver" duplicados (60k y 100k).
3. Choose Duration: corregir la fecha de payout (Apr 2024 < Nov 2024) y el total coherente con el cashback.
4. Personal Info: las etiquetas deben ser Nombre / Apellido / Teléfono / Email.
5. Payout History: el ítem "40,00 MAD … You have paid" está en la pestaña Payouts.
6. Payment Settings: el subtítulo copiado de Eligibility.

## 7. Siguiente paso recomendado

1. Sesión con PO, UX y Legal para cerrar **M1–M3, R1–R5, L1–L2** (bloquean el núcleo).
2. Diseñar **D1–D4** (bloquean el MVP transaccional) y **D13** (operación).
3. Con el diseño listo, ejecutar de nuevo `/analyze-figma` → `/generate-backlog` sobre las pantallas nuevas y crear los issues adicionales (estimación preliminar: D1 +20–30 SP, D2–D5 +15–20 SP, D13 a estimar por separado).
