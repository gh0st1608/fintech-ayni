# Convenciones de automatización

## Casos

- **ID:** `TC-<TYPE>-<DOMAIN>-<FEATURE>-<NNN>`. El nombre del request es `<ID> · <qué valida>`.
- **Tipos:**
  - `FUNC`, `NEG` y `SEC`;
  - `CONTRACT`, `INTEGRATION` y `DATA` (integridad);
  - `REGRESSION` y `OPS`.
- **Requisito:** cada request lleva en su descripción el ticket de Jira y, si aplica, el criterio de aceptación, la regla (R5, R9…) o el riesgo OWASP. De ahí sale la matriz de trazabilidad.
- **Un caso, una intención:** una request prueba una cosa. Los pasos previos de un flujo son casos propios, con su ID y sus assertions.
- **prd:** un caso se marca como seguro (`prd: 'safe'`) solo si no crea datos ni gasta límites de usuarios reales. Si además necesita un token de prueba, se marca con `prd: 'auth'`.

## Scripts

- **La fuente es `scripts/build-collection.mjs`.** El JSON de la colección es un artefacto. CI falla si no se regeneró (`git diff --exit-code`).
- **Pruebas comunes** (pre-request y tests de la colección):
  - el sobre de respuesta;
  - `Content-Type`, tiempo y `x-trace-id`;
  - que no se filtren detalles internos;
  - el `testRunId`, la cabecera `x-qa-run-id` y la guarda de prd.
- **Pruebas de cada request:** empiezan con el _prelude_, que trae `body`, `data`, `isMoney`, `expectError`, `expectStatus` y `save`. Van en un bloque `{ }`, porque el sandbox de Postman ya declara `data` como global.
- **Errores:** `expectError(http, code)` valida el código HTTP, `success: false` y el `error.code` del contrato. Nunca se valida solo el código HTTP cuando el contrato define un `error.code`.
- **Dinero:** se compara en unidades menores enteras (`amount`) y con la misma moneda; nunca con decimales.
- **Variables:**
  - **Environment** (`ENV_*`, `baseUrl`): la configuración del ambiente.
  - **Colección:** los IDs, tokens y estados generados en la corrida.
  - Nada sensible queda versionado: los tokens se generan en la corrida y los secretos de prd van en environments locales o en secretos de CI.
- **Datos únicos:** emails, claves de idempotencia y teléfonos llevan el `testRunId`. No se reutilizan datos de corridas anteriores.

## Agregar un caso

1. Elegir la carpeta y el siguiente número del dominio.
2. Agregar el `tc(...)` con el método, la ruta, la autenticación (`A`, `B`, `C`, `P`, `none` o `raw:…`), el cuerpo, el requisito y las pruebas.
3. `npm run build`.
4. `npm run test:dev` contra una API local: el caso nuevo debe pasar, y debe fallar si se rompe la regla que prueba.
