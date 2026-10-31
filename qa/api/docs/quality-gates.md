# Quality gates

Condiciones para aprobar una versión de la API. Se acuerdan con desarrollo, producto, seguridad y operaciones. Un defecto crítico no queda oculto por un porcentaje alto de pruebas exitosas.

| Criterio                                                        | Condición                                                                                                                             | Cómo se mide                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Smoke (`00-Framework`, `08-Regression/Smoke`, `09-Operational`) | 100 % aprobado                                                                                                                        | `npm run test:smoke:dev` / job `api-qa` |
| Flujo crítico (`08-Regression/Critical-Flows`)                  | 100 % aprobado                                                                                                                        | Job `api-qa`                            |
| Seguridad (`TC-SEC-*`)                                          | 100 % aprobado                                                                                                                        | Job `api-qa`                            |
| Contrato (`TC-CONTRACT-*` y assertions comunes)                 | 100 % aprobado                                                                                                                        | Job `api-qa`                            |
| Regresión completa                                              | 100 % aprobado en `main`. Un caso que falla se corrige o se registra como defecto con su severidad; nunca se borra para pasar el gate | Job `api-qa`                            |
| prd después de un despliegue                                    | 100 % de los casos seguros                                                                                                            | `npm run test:prd`                      |
| Defectos críticos                                               | Ninguno abierto                                                                                                                       | Jira                                    |
| Defectos altos                                                  | Según la política de aceptación de riesgos del PO                                                                                     | Jira                                    |
| Vulnerabilidades altas o críticas en la herramienta             | Ninguna sin excepción vigente                                                                                                         | `check-audit.mjs` en el job             |
| Rendimiento                                                     | Pendiente: no hay SLO de latencia acordados. El umbral por request (2000 ms) es solo indicativo                                       | —                                       |
| Evidencia                                                       | JUnit y HTML publicados en cada corrida, también si falla                                                                             | Artefacto `api-qa-reports`              |

## Métricas

- Casos aprobados, fallidos y omitidos por corrida, y su duración (resumen de Newman).
- Casos inestables (_flaky_): un caso que falla y pasa sin cambios se registra y se corrige; no se reintenta en silencio.
- Cobertura de requisitos: [traceability-matrix.md](traceability-matrix.md) enlaza cada caso con su historia.
- Defectos encontrados por la colección y escapados a producción.

## Gestión de defectos

Cada defecto se registra en Jira con:

- el ID del caso que lo detectó (`TC-…`);
- el request y la respuesta (traceId incluido);
- el resultado esperado según el contrato;
- la severidad y el reporte HTML de la corrida.
