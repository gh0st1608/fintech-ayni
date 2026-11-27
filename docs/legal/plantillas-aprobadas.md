# Plantillas de contrato y pagaré: registro de aprobaciones

COPAYNI-119. Este archivo es el registro humano de qué texto está aprobado, por quién y desde
cuándo. El registro que **aplica el sistema** es
[`template-approvals.ts`](../../apps/backend/src/modules/agreements/domain/template-approvals.ts):
una cadencia sin entrada ahí no se puede habilitar, porque la validación de entorno impide
arrancar la API.

Los dos tienen que decir lo mismo. Si se aprueba una plantilla, se añade la fila aquí **y** la
entrada en el código, en el mismo cambio.

## Por qué hay un registro

El contrato y el pagaré describen la obligación que el miembro asume. Las plantillas que existían
antes de las cadencias hablan de «meses» y de «mes de cobro», y en una junta semanal eso es falso:
diez turnos semanales no son diez meses ni diez cuotas mensuales. El pagaré es además el título
que respalda el cobro, así que su texto tiene que coincidir con el calendario que el sistema
aplica, no con una equivalencia aproximada a meses.

## Estado

| Cadencia  | Versión de la plantilla                                           | Base             | Aprobó               | Fecha      | Referencia                                                  |
| --------- | ----------------------------------------------------------------- | ---------------- | -------------------- | ---------- | ----------------------------------------------------------- |
| monthly   | `contract-provisional-2-monthly`, `promissory-note-provisional-2-monthly` | `provisional-po` | PO (Erick Galindo)   | 2026-11-16 | [pending-scope §3.3](../pending-scope.md#33-pagaré-ejecutable-preguntas-para-legal-p3): lanzar con firma simple por OTP y tope de payout bajo |
| biweekly  | —                                                                 | —                | **Sin aprobación**   | —          | Bloquea habilitar `biweekly` en `CIRCLE_CADENCES_ENABLED`   |
| weekly    | —                                                                 | —                | **Sin aprobación**   | —          | Bloquea habilitar `weekly` en `CIRCLE_CADENCES_ENABLED`     |

### Qué significa cada base

- **`legal`**: el área legal redactó y aprobó el documento **renderizado** de esa cadencia, no la
  plantilla en abstracto. Es lo que exige COPAYNI-119 para habilitarla.
- **`provisional-po`**: el texto **no** lo redactó Legal. El PO aceptó emitirlo así el 16 de
  noviembre de 2026, con la exposición acotada por el tope de payout. Sirve como reconocimiento de
  deuda firmado; **no** como título valor con mérito ejecutivo. El aviso va dentro del propio
  documento.

## Qué tiene que revisar Legal para aprobar una cadencia

El documento se genera con una sola plantilla parametrizada, así que lo que hay que revisar es el
**resultado renderizado** de cada cadencia. Lo que ya cambió para que diga la verdad:

1. **El plazo son turnos y fechas, no meses.** «Un círculo de ahorro de 10 semanas, con aportes de
   frecuencia semanal, que inicia el 2026-11-04 y termina el 2027-01-13.»
2. **El calendario completo de vencimientos**, una línea por turno con su fecha real. En una junta
   de 12 turnos son 12 líneas. Es lo que hace que el título coincida con lo que se cobra.
3. **La equivalencia en meses solo como referencia**, marcada como tal y nunca como plazo: «unos
   2,8 meses (84 días corridos). El plazo de la obligación son las fechas de arriba.» No se imprime
   en cadencia mensual, donde el plazo ya está en meses.
4. **La retención y lo que recibe de inmediato**, los dos importes. En una junta de 4 turnos la
   retención llega al 50 % del pozo para quien cobra primero, y el documento tiene que decirlo.
5. **Los días de gracia y el cargo por mora de esa cadencia** (COPAYNI-111), con el valor
   configurado, no «el vigente». Quedan fijados en el texto firmado, así que un cambio posterior de
   configuración no altera lo ya firmado.
6. **La frecuencia nombrada en su unidad**: «cuota base por turno», «fecha de cobro del pozo». Fuera
   de la cadencia mensual el texto no dice «mes» en ninguna parte.

### Lo que sigue pendiente y no lo resuelve esta tarea

Las preguntas de ejecutabilidad del pagaré —PG1 a PG6 de
[pending-scope §3.3](../pending-scope.md#33-pagaré-ejecutable-preguntas-para-legal-p3)— siguen
abiertas y se siguen en COPAYNI-99. En particular **PG3**, cómo se fija el monto de un pagaré
cuando la deuda es contingente, que afecta a la validez del título en cualquier cadencia.

Las decisiones de riesgo y finanzas sobre el cargo por mora y la retención por cadencia se
cerraron en **COPAYNI-102** el 27 de noviembre de 2026: gracia de 3, 2 y 1 día y cargo por mora de
300, 140 y 70 bps en mensual, quincenal y semanal, con la retención acotada al 25 % del pozo. El
documento imprime esos valores, y quedan fijados en el texto que se firma.

## Cómo se aprueba una cadencia

1. Generar el documento renderizado de esa cadencia con datos reales de una junta de ejemplo
   (`renderAgreement`), y adjuntarlo a la revisión.
2. Legal revisa ese texto exacto, no un resumen.
3. Con el visto bueno: añadir la fila en este archivo y la entrada en `template-approvals.ts` con
   `basis: 'legal'`, quién aprobó y la fecha, en el mismo cambio.
4. Recién entonces se puede añadir la cadencia a `CIRCLE_CADENCES_ENABLED`. Antes de eso, la API no
   arranca con ella habilitada.
