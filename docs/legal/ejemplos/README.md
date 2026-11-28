# Documentos renderizados para la revisión de Legal

COPAYNI-119. Son los textos **exactos** que el sistema emitiría, generados con `renderAgreement`
el 27 de noviembre de 2026 a partir de juntas de ejemplo con datos reales. El paso 1 del
procedimiento de [plantillas-aprobadas.md](../plantillas-aprobadas.md#cómo-se-aprueba-una-cadencia)
pide adjuntar esto a la revisión: Legal revisa **este texto**, no un resumen.

Cada archivo lleva el contrato y el pagaré de la misma junta, precedidos por sus datos.

| Archivo                                            | Junta                                        | Cuota base | Retención | Recibe de inmediato | Gracia | Mora   | Plantilla      |
| -------------------------------------------------- | -------------------------------------------- | ---------- | --------- | ------------------- | ------ | ------ | -------------- |
| [semanal-4-turnos.txt](semanal-4-turnos.txt)       | Semanal, 4 turnos, S/ 3.000, turno 1         | S/ 750     | S/ 750    | S/ 2.250            | 1 día  | 0,70 % | `provisional-po` |
| [semanal-12-turnos.txt](semanal-12-turnos.txt)     | Semanal, 12 turnos, S/ 6.000, turno 1        | S/ 500     | S/ 1.500  | S/ 4.500            | 1 día  | 0,70 % | `provisional-po` |
| [quincenal-4-turnos.txt](quincenal-4-turnos.txt)   | Quincenal, 4 turnos, S/ 3.000, turno 1       | S/ 750     | S/ 750    | S/ 2.250            | 2 días | 1,40 % | `provisional-po` |
| [mensual-10-turnos.txt](mensual-10-turnos.txt)     | Mensual, 10 turnos, S/ 30.000, turno 3       | S/ 3.000   | S/ 6.000  | S/ 24.000           | 3 días | 3,00 % | `provisional-po` |

Los cuatro llevan dentro del propio texto la línea **«Aprobación de la plantilla: provisional-po
— PO (Erick Galindo)»** con su fecha: el 16/11/2026 la mensual, que ya se emite en producción, y
el 28/11/2026 la semanal y la quincenal, que el PO firmó sobre **estos** textos. Los cuatro llevan
también el aviso de que el texto está pendiente de redacción por el área legal: valen como
reconocimiento de deuda firmado, no como título valor con mérito ejecutivo.

**Que el PO los haya firmado no sustituye la revisión de Legal**, que es la que convierte la base
a `legal` en [plantillas-aprobadas.md](../plantillas-aprobadas.md). Lo que cambia es que las
cadencias ya se pueden habilitar y probar.

## Por qué cada ejemplo

- **Semanal de 4 turnos:** la junta más corta en la cadencia más rápida. Es donde se ve el tope de
  retención del 25 % del pozo (COPAYNI-102): retiene 1 cuota y no 2. Los cuatro vencimientos caen
  en el mismo mes, así que el plazo **no** se puede expresar en meses.
- **Semanal de 12 turnos:** el máximo admitido (COPAYNI-101), 84 días. El calendario lleva doce
  líneas y la referencia en meses —2,8— no cuadra con ningún número entero de meses.
- **Quincenal de 4 turnos:** la cadencia intermedia, con su gracia de 2 días y su cargo de 1,40 %.
- **Mensual de 10 turnos:** el círculo de referencia de pending-scope §3.1, para contrastar.

## Qué tiene que revisar Legal

La lista completa está en
[plantillas-aprobadas.md](../plantillas-aprobadas.md#qué-tiene-que-revisar-legal-para-aprobar-una-cadencia).
En resumen: que el plazo expresado en turnos y fechas describa la obligación real, que el
calendario de vencimientos coincida con lo que se cobra, que la retención y el importe que recibe
de inmediato estén ambos dichos, y que la gracia y el cargo por mora de esa cadencia sean los que
de verdad se aplican.

Sigue abierta la ejecutabilidad del pagaré —PG1 a PG6 de
[pending-scope §3.3](../../pending-scope.md#33-pagaré-ejecutable-preguntas-para-legal-p3), en
COPAYNI-99—, en particular **PG3**: el monto de un pagaré debe ser determinado y aquí la deuda es
contingente. Afecta a cualquier cadencia, incluida la mensual que ya se emite.

## Cómo regenerarlos

Los textos salen del código, así que si la plantilla o los parámetros cambian hay que regenerarlos
antes de volver a pedir la revisión. Con el backend compilado (`npm run build`), un script que
construya `CircleTerms`, cotice con `SlotPricing` y llame a `renderAgreement` reproduce estos
mismos archivos; los datos de cada junta están en la cabecera de cada uno.
