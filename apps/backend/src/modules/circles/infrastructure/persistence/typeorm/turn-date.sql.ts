/**
 * Día en que le toca el turno `position` de un círculo, en SQL.
 *
 * Es el **espejo** de la regla de avance que define `Cadence` en el dominio, para las lecturas
 * que no pueden traerse las filas y calcularlo en TypeScript: el feed de notificaciones, que es
 * una unión de `SELECT`, y el calendario de cobros del usuario.
 *
 * Duplicar una regla de calendario es justo lo que `Cadence` vino a evitar, así que esta copia
 * solo se sostiene con una prueba que la compare con el dominio cadencia por cadencia
 * (`turn-date.sql.spec.ts`). Si alguien añade una cadencia y no la añade aquí, el `CASE` devuelve
 * nulo y la fila desaparece de la lectura, en lugar de devolver una fecha equivocada; y la prueba
 * falla.
 *
 * `starts_on` es la fecha real de arranque (COPAYNI-106) y el turno es un ordinal (COPAYNI-100),
 * así que el turno 1 vence el día de arranque. En paso calendario, un día que no existe en el mes
 * destino se ajusta al último, igual que hace `Cadence.advance`: PostgreSQL ya lo hace al sumar
 * meses.
 */
export const turnDateSql = (circle: string, position: string): string => `
  CASE ${circle}.cadence
    WHEN 'monthly' THEN (${circle}.starts_on + make_interval(months => (${position}) - 1))::date
    WHEN 'biweekly' THEN (${circle}.starts_on + make_interval(days => 14 * ((${position}) - 1)))::date
    WHEN 'weekly' THEN (${circle}.starts_on + make_interval(days => 7 * ((${position}) - 1)))::date
  END`;

/** Mes en que cae ese turno, para los informes y los avisos que hablan en `YYYY-MM`. */
export const turnMonthSql = (circle: string, position: string): string =>
  `date_trunc('month', ${turnDateSql(circle, position)})`;
