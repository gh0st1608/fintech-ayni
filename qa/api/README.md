# QA de la API: colección Postman y Newman

Pruebas funcionales, de contrato, integración, seguridad, integridad de datos, regresión y operativas de la API de Ayni. Siguen la _Base Técnica QA Senior Enterprise_ (Postman, Newman, OpenAPI y CI/CD).

```text
qa/api/
├── collections/ayni-api.postman_collection.json   colección generada (no editar a mano)
├── environments/
│   ├── dev.postman_environment.json               API local o por ngrok: corre todo
│   └── prd.postman_environment.json               producción: solo pruebas seguras
├── scripts/build-collection.mjs                   fuente de la colección
├── docs/
│   ├── test-strategy.md                           alcance, niveles, datos, ambientes y riesgos
│   ├── quality-gates.md                           criterios de aprobación
│   ├── automation-guidelines.md                   convenciones de casos y scripts
│   └── traceability-matrix.md                     requisito de Jira → caso → request (generada)
├── audit-allowlist.json                           excepciones de vulnerabilidades, con motivo y vencimiento
└── reports/                                       JUnit y HTML de cada ejecución (no se versiona)
```

## Cobertura

159 casos en 10 carpetas:

| Carpeta              | Casos | Qué cubre                                                                          |
| -------------------- | ----- | ---------------------------------------------------------------------------------- |
| 00-Framework         | 6     | Health, validación del ambiente y alta de los usuarios A y B                       |
| 01-Authentication    | 20    | OTP, refresh con rotación, logout, rate limit y ciclo de vida del token            |
| 02-Users             | 15    | Perfil, límites de los campos, cambio de email con OTP, inyección                  |
| 03-Circles           | 25    | join-config, cuotas, turnos, unión idempotente, reglas de confianza y concurrencia |
| 04-Payments          | 26    | Método de cobro, preferencias, elegibilidad, tarjetas, historial y pago de cuotas  |
| 05-Documents         | 20    | Subidas prefirmadas a S3, DNI, comprobante de ingresos y límite mensual            |
| 06-Referrals-Savings | 15    | Código de invitación, canje, saldo y cotización del ahorro                         |
| 07-Security          | 13    | Rutas protegidas, BOLA/BFLA, webhook sin firma, datos sensibles, cabeceras         |
| 08-Regression        | 16    | Smoke de solo lectura y el flujo crítico de unión de punta a punta                 |
| 09-Operational       | 3     | Readiness, health sin autenticación y correlación por `traceId`                    |

Por tipo: FUNC 48, NEG 58, SEC 23, REGRESSION 16, OPS 4, CONTRACT 4, INTEGRATION 3 y DATA 3.

Cada request valida además las **assertions comunes**:

- el sobre `{ success, data|error, traceId }`;
- el `Content-Type`;
- el tiempo de respuesta;
- que `x-trace-id` coincida con el `traceId`;
- que no se filtren detalles internos (stack, SQL).

## Ejecutar

```bash
cd qa/api
npm ci
npm run test:dev                       # todo contra http://localhost:3000
npm run test:dev -- --env-var baseUrl=https://<tu-dominio>.ngrok-free.app
npm run test:smoke:dev                 # health, smoke de lectura y operativas
npm run test:prd                       # solo lo seguro en producción
```

- **Reportes:** quedan en `reports/` (JUnit para CI, HTML como evidencia).
- **Requisitos de dev:** la API levantada como en [docs/dev-environment.md](../../docs/dev-environment.md). Para las subidas reales, con `DOCUMENT_STORAGE=s3`; con almacenamiento simulado se omiten las 3 pruebas de subida a S3.
- **Rate limit:** la colección hace unas 170 peticiones en ~20 s desde una IP. Hay que subir el límite de la API en dev (`RATE_LIMIT_MAX=5000`); con el valor por defecto (100 por minuto) aparecen respuestas 429.
- **En Postman:** importar la colección y los dos environments, elegir el ambiente y usar _Run collection_. Cada corrida completa crea usuarios nuevos: el `testRunId` se renueva en la primera request.

## Ambientes

| Variable               | dev                         | prd                                                      |
| ---------------------- | --------------------------- | -------------------------------------------------------- |
| `baseUrl`              | `http://localhost:3000`     | `https://backend-ayni.solutionserj.com`                  |
| `ENV_ALLOW_WRITES`     | `true`                      | `false`: corren solo los 29 casos marcados como seguros  |
| `ENV_OTP_CODE`         | `1234` (`OTP_DEV_CODE`)     | vacío: en producción no hay código fijo                  |
| `ENV_PRD_ACCESS_TOKEN` | —                           | **secreto**, opcional: habilita el smoke de solo lectura |
| `ENV_CARD_TOKEN_*`     | Tokens de la pasarela falsa | vacíos                                                   |

**Producción:**

- No crea usuarios ni datos.
- Corre health, readiness, rechazos sin autenticación, validaciones de entrada, la API de administración sin credenciales, el webhook sin firma y las cabeceras de seguridad.
- El smoke autenticado necesita un access token de una cuenta de prueba en `ENV_PRD_ACCESS_TOKEN`. Ese token nunca se versiona: va en un environment local (`environments/*.local.json`, ignorado por git) o en un secreto de CI.

## CI

[.github/workflows/api-qa.yml](../../.github/workflows/api-qa.yml) corre en cada push y PR a `main`, y también a mano:

1. Levanta PostgreSQL, floci y la API.
2. Comprueba que la colección generada esté al día.
3. Ejecuta Newman.
4. Publica los reportes y el log de la API, aunque la corrida falle.

## Mantener la colección

1. Editar `scripts/build-collection.mjs`.
2. Ejecutar `npm run build`, que regenera la colección y la matriz de trazabilidad.
3. Correr `npm run test:dev` contra una API local antes de subir el cambio.

Las convenciones están en [docs/automation-guidelines.md](docs/automation-guidelines.md).
