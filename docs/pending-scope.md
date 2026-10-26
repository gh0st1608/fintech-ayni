# Alcance pendiente para completar el producto — Ayni

Este documento recoge lo que **falta definir, diseñar o decidir** para completar el alcance. El backlog creado en Jira (ver [backlog-analysis.md](backlog-analysis.md)) cubre solo lo respaldado por el Figma. Lo de aquí **no tiene issues** hasta que exista diseño o una decisión.

Responsables sugeridos: **PO** = Product Owner / negocio, **UX** = diseño, **TL** = tech lead / arquitectura, **Legal** = cumplimiento.

## 1. Moneda e idioma (decisión transversal)

El Figma está localizado para Marruecos/Egipto (MAD, árabe, Fawry). El backlog ya obliga a que **ni la moneda ni los textos estén hardcodeados**:

- **Idiomas:** la app usa archivos JSON por idioma (`src/app-core/i18n/locales/<código>.json`). Agregar un idioma = agregar un JSON (tarea T1.9; selector en H6.7).
- **Moneda:** modelo `Money { amount en unidades menores, currency ISO 4217 }`, moneda por defecto en configuración, formato con `Intl.NumberFormat` (tarea T1.10).

| # | Pendiente | Responsable | Propuesta |
|---|---|---|---|
| M1 | Moneda oficial de operación | PO | PEN (sol peruano) |
| M2 | ¿Se aceptan varias monedas (PEN y USD)? ¿Un círculo puede ser en USD? | PO | Una sola moneda por círculo; empezar solo con PEN |
| M3 | Idioma por defecto y lista de idiomas del MVP | PO | `es` por defecto, `en` secundario; quechua o aimara a evaluar; árabe descartado salvo confirmación |
| M4 | Traducción de todos los textos del Figma al español y revisión de tono | UX / PO | Generar `es.json` a partir de los textos del Figma |
| M5 | Corregir en el diseño los montos que están en MAD y USD (incoherencia 150 USD / 150 MAD) | UX | Usar la moneda de M1 |
| M6 | Rangos de montos en la nueva moneda (payout 3.000–120.000, ahorro hasta 1.000.000, prepaid 100.000, referido 150) | PO | Recalcular según el mercado objetivo |

## 2. Pantallas y flujos sin diseño

| # | Pendiente | Por qué es necesario | Responsable |
|---|---|---|---|
| D1 | **Pago de la cuota mensual (pay-in):** cuotas pendientes, pagar con tarjeta guardada, confirmación, recibo, pago fallido | Núcleo financiero; sin esto el círculo no funciona | UX / PO |
| D2 | Pantalla de **confirmación de unión** al Game'ya (resumen, aceptar términos) | El User Flow la incluye ("Confirm"), pero no existe la pantalla | UX |
| D3 | **Firma del contrato y del pagaré de seguro** (Insurance Note) | El checklist de elegibilidad los exige | UX / Legal |
| D4 | **Add Account:** datos de la cuenta bancaria o wallet para recibir el payout | El User Flow la incluye, pero no hay diseño | UX |
| D5 | Paso posterior a "Next" en el **programa de ahorro** (confirmación y primer pago) | El flujo termina sin destino | UX |
| D6 | **Notificaciones:** bandeja, tipos (cuota por vencer, turno de cobro, documento aprobado) y push | La campana aparece en todas las pantallas | UX / PO |
| D7 | **Payment Policy, Help / Get Help** (contenido, FAQ, canal de soporte) | Hay accesos, pero no pantallas | UX / PO |
| D8 | **Detalle** de círculo, de círculo finalizado y de transacción | Los chevrons no llevan a ningún destino | UX |
| D9 | Flujos de **passcode** (crear, cambiar, recuperar) y activación de **biometría** | Menús visibles sin flujo (historias H2.5/H2.6 marcadas `pendiente-diseno`) | UX / PO |
| D10 | Estados de **error y carga** por pantalla (sin red, sesión expirada, documento rechazado) | Solo están diseñados algunos estados vacíos | UX |
| D11 | Significado y comportamiento del **icono de fuego** del header | Sin definir | PO / UX |
| D12 | **Login social** (el texto lo menciona, pero no hay botones) | Decidir si entra o se elimina el texto | PO |
| D13 | **Back-office** de administración: crear y operar círculos, validar KYC, conciliar pagos, gestionar ofertas y metas | Sin él no se puede operar el producto | PO / UX / TL |

## 3. Reglas de negocio por confirmar

| # | Pregunta | Afecta a |
|---|---|---|
| R1 | Fórmula de **fees de los primeros slots** y **descuentos de los últimos** | T3.1, H3.6 |
| R2 | Cómo se **forman los círculos** (admin o automático), número de miembros, qué pasa si no se llenan | T3.1, H3.1, H3.7 |
| R3 | **Mora e impago:** penalidades, uso del seguro y del pagaré, exclusión del círculo | T3.1, D1, D3 |
| R4 | ¿Las **Admin Fees** se suman a la cuota o se descuentan del payout? (24.000 frente a 2.880) | T3.1, H3.5 |
| R5 | Fórmula del **límite mensual de pay-in** según ingresos y documentos | H6.1, H6.5, H3.7 |
| R6 | Fórmula del **cashback** del ahorro (el diseño muestra 20% y 5%) y nombres de los planes | H4.1, H4.2 |
| R7 | Reglas de **referidos:** tope de invitaciones, expiración del saldo, moneda | H7.1–H7.3 |
| R8 | ¿Cuándo se puede **cambiar el método de cobro** y qué pasa con los payouts en curso? | H5.3 |
| R9 | ¿Cambiar teléfono o email exige **re-verificación OTP**? | H6.2 |
| R10 | Política de **OTP:** duración, intentos y reenvíos; comportamiento de "Remember Me" | H2.3 |
| R11 | Qué **documentos** son obligatorios y cuáles opcionales; verificación manual o automática; vigencia | H6.3–H6.6 |

## 4. Decisiones técnicas y de proveedores

| # | Decisión | Issue relacionado |
|---|---|---|
| T1 | Despliegue: AWS Lambda + API Gateway o contenedores (ECS/Fargate) | T1.4 (spike) |
| T2 | Base de datos (relacional recomendada por la naturaleza transaccional) | T1.4 (spike) |
| T3 | Pasarela de pago y tokenización (PCI-DSS) disponible en el país | T5.1 (spike) |
| T4 | Proveedor de verificación de identidad y OCR | T6.1 (spike) |
| T5 | Proveedores de payout: bancos, wallets locales (p. ej. Yape/Plin si es Perú), prepago | H5.3, D4 |
| T6 | Proveedor de envío de OTP (SMS y email) | H2.2 |
| T7 | Proveedor de push notifications | D6 |
| T8 | Crash reporting y telemetría mobile | T1.6 |
| T9 | Firma electrónica de contrato y pagaré | D3 |

## 5. Cumplimiento y legal

| # | Pendiente | Responsable |
|---|---|---|
| L1 | Regulador aplicable (el diseño cita "Central Bank"; en Perú, SBS/UIF) y si la cooperativa requiere licencia para esta operativa | Legal |
| L2 | Requisitos KYC/AML (prevención de lavado de activos): documentos, listas restrictivas, monitoreo | Legal / TL |
| L3 | Protección de datos personales (Ley 29733 en Perú): consentimiento, retención y derechos ARCO | Legal |
| L4 | Textos de Términos de Uso y Política de Privacidad | Legal |
| L5 | Retención y eliminación de documentos KYC | Legal / TL |

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
