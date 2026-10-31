# Estrategia de pruebas de la API

## Objetivo

Verificar que la API cumple sus contratos (`docs/api/*.md`) y las reglas de negocio de las historias de Jira. También que rechaza, limita y protege lo que debe, y que cada ejecución deja evidencia verificable.

## Alcance

| Dentro                                                                           | Fuera (y con qué se cubriría)                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Endpoints `/v1` de auth, perfil, círculos, pagos, documentos, referidos y ahorro | Carga, estrés y picos (k6 o Gatling, con SLO definidos)                             |
| Health, readiness y correlación por `traceId`                                    | E2E de la app mobile (Appium o Maestro)                                             |
| Autenticación, autorización (BOLA/BFLA), datos sensibles y cabeceras             | DAST completo (OWASP ZAP, en un ambiente autorizado)                                |
| Idempotencia y concurrencia de la unión y de las tarjetas                        | El ciclo mensual (`circle-cycle`): lo cubren las pruebas de integración del backend |
| Subida real de documentos a S3 (floci en dev)                                    | Mercado Pago sandbox: falta la cuenta (COPAYNI-34)                                  |

## Niveles y técnicas

| Técnica                     | Dónde se aplica                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positivas y negativas       | Todas las carpetas: cada endpoint tiene su caso feliz y sus rechazos documentados                                                                                                                     |
| Valores límite (BVA)        | Nombre de 80/81 caracteres, payout en el mínimo, fuera del salto y sobre el máximo, `limit` 0 y 51, tamaño 0 y 10 MB + 1, 11 páginas                                                                  |
| Particiones de equivalencia | Tipos de identificador, propósitos de subida, métodos de pago y estados de cada recurso                                                                                                               |
| Transiciones de estado      | Refresh con rotación, reutilización de un token ya rotado, logout idempotente, documento usado una sola vez                                                                                           |
| Reglas de negocio           | Cuota = payout / meses, fee solo en `fastest_payout`, descuento solo en `highest_return`, saldo = ganado − canjeado, total = objetivo + cashback, límite = 30 % del ingreso                           |
| Contrato                    | El sobre común en todas las respuestas, los montos como `Money`, los esquemas de join-config, recomendados, resumen de pagos y planes                                                                 |
| Idempotencia y concurrencia | Reintento con la misma clave (misma respuesta), clave reutilizada con otros datos (409) y el mismo turno pedido por otro usuario (409)                                                                |
| Seguridad                   | Rutas protegidas sin token, JWT con `alg: none` o firma alterada, BOLA con un segundo usuario, BFLA en la API de administración, webhook sin firma, PAN y CVC nunca expuestos, `X-Powered-By` ausente |
| Regresión                   | Smoke de solo lectura y el flujo crítico de unión de punta a punta                                                                                                                                    |

## Datos de prueba

- **Aislamiento:**
  - Cada corrida genera un `testRunId`.
  - Todos los usuarios usan emails únicos del dominio reservado `qa.ayni.test` (`qa-a-<runId>@qa.ayni.test`).
  - El teléfono es un número aleatorio.
  - Las claves de idempotencia incluyen el `testRunId`.
  - No se depende de datos previos: dos corridas seguidas sobre la misma base pasan.
- **Usuarios:**
  - **A:** el usuario principal.
  - **B:** el segundo usuario para BOLA, concurrencia y referidos.
  - **C:** el flujo crítico.
  - **D:** las pruebas de OTP.
  - **R:** el rate limit de inicios de sesión.
  - **P:** la sesión por teléfono.
- **Dinámicos:** el payout se calcula desde `join-config`, y la duración y los turnos desde las respuestas anteriores. Así la colección no se rompe si cambian los montos configurados.
- **Limpieza:** la API no expone borrado de usuarios ni de círculos. Los datos quedan en la base de dev, identificados por el `testRunId`. Para empezar de cero se recrea la base (`npm run db:up` sobre un volumen nuevo). Nunca se borra nada en prd: allí la colección no crea datos.

## Ambientes

|              | dev                                                              | prd                                                                                       |
| ------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Para qué     | Regresión completa, en local o en CI                             | Verificar un despliegue sin tocar datos reales                                            |
| Qué corre    | Todo                                                             | Los 29 casos marcados como seguros, más el smoke de lectura si hay `ENV_PRD_ACCESS_TOKEN` |
| Dependencias | PostgreSQL, floci (S3), pasarela y KYC simulados, `OTP_DEV_CODE` | Las reales                                                                                |

La guarda está en el pre-request de la colección. Con `ENV_ALLOW_WRITES` distinto de `true`, toda request que no esté en `PRD_SAFE_TESTS` se omite (`pm.execution.skipRequest()`).

## Riesgos

| Riesgo                                                  | Mitigación                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limit por IP durante la corrida                    | `RATE_LIMIT_MAX` alto en dev y en CI; el rate limit del OTP se prueba con un identificador propio                                           |
| Dependencia entre requests (la colección es secuencial) | Las carpetas se ejecutan en orden. Correr una carpeta sola requiere haber corrido antes 00-Framework                                        |
| Reglas provisionales (R2, R5, R7, R18)                  | Los valores se leen de la API o del environment (`ENV_PAYIN_LIMIT_INCOME_SHARE_BPS`); al cambiar una regla se ajusta el caso y su requisito |
| Umbral de tiempo sin SLO formal                         | `ENV_MAX_RESPONSE_MS=2000` es indicativo; se reemplaza por el SLO de latencia cuando esté definido                                          |
| Vulnerabilidades transitivas de Newman                  | `overrides` y excepciones con vencimiento en `audit-allowlist.json`                                                                         |
