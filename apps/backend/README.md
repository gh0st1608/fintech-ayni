# Ayni API (backend)

API REST de Ayni: NestJS 11 + TypeScript strict con arquitectura hexagonal por módulos, siguiendo la guía _Backend Enterprise NestJS_.

**Estado:**

- Fundaciones (COPAYNI-8) y el primer endpoint real, `GET /v1/circles/join-config`, que consume la app mobile.
- CI, Husky y commitlint (COPAYNI-9): ver el README de la raíz.
- Observabilidad (COPAYNI-10): OpenTelemetry con exportación OTLP a New Relic, logs JSON correlacionados y health checks.
- Dominio de círculos (COPAYNI-24): términos, precio por slot, cronograma de cuotas, reserva atómica e idempotente, y `GET /v1/circles/installment-options`.
- Persistencia (COPAYNI-24): PostgreSQL con TypeORM, migraciones versionadas y readiness de la base de datos.
- Slots del círculo ofrecido (COPAYNI-30): `GET /v1/circles/slots`, con la regla provisional de asignación (R2) y el precio configurable (R1).
- Métodos de cobro (COPAYNI-37): `GET` y `PUT /v1/me/payout-method` con un catálogo provisional ([docs/api/payouts.md](../../docs/api/payouts.md)).
- Perfil (COPAYNI-50): `PATCH /v1/me` con el idioma preferido ([docs/api/me.md](../../docs/api/me.md)).
- Autenticación (COPAYNI-19, 20 y 21): OTP, JWT ES256 y refresh tokens rotativos con detección de reutilización ([docs/api/auth.md](../../docs/api/auth.md)).
- Pendiente: despliegue en AWS (COPAYNI-12) y el proveedor de envío de OTP (pending-scope T6).

## Requisitos

- Node.js 22.13 o superior (`.nvmrc`) y npm 10.
- Docker, para PostgreSQL 17 ([compose.yaml](compose.yaml)). Las pruebas de integración y e2e lo necesitan.

```bash
cd apps/backend
npm install
cp .env.example .env   # valores de desarrollo, sin secretos
npm run db:up          # PostgreSQL en 127.0.0.1:5432 con las bases ayni y ayni_test
npm run migrate:dev    # aplica las migraciones a la base de desarrollo
npm run start:dev      # http://localhost:3000, Swagger en /docs si ENABLE_SWAGGER=true
```

## Scripts

| Script                      | Qué hace                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `start:dev` / `start:debug` | Compila en modo watch y reinicia la API (`--inspect` en debug).                        |
| `build`                     | Compila `src` a `dist` con `tsconfig.build.json`.                                      |
| `db:up` / `db:down`         | Levanta o detiene el PostgreSQL local (los datos quedan en un volumen).                |
| `migrate` / `migrate:dev`   | Aplica las migraciones pendientes con `dist/migrate.js` (`migrate:dev` compila antes). |
| `start` / `start:prod`      | Ejecuta `dist/main.js`.                                                                |
| `test` / `test:watch`       | Pruebas unitarias y de integración.                                                    |
| `test:e2e`                  | Pruebas e2e: la API completa en memoria con supertest.                                 |
| `test:cov`                  | Todas las pruebas con cobertura. Exige 90% en statements, branches, functions y lines. |
| `lint` / `lint:fix`         | ESLint con reglas tipadas y reglas de dependencia entre capas.                         |
| `format` / `format:check`   | Prettier.                                                                              |
| `typecheck`                 | `tsc --noEmit`, incluidas las pruebas.                                                 |
| `validate`                  | lint + typecheck + format:check + test:cov + build. Es lo que debe correr CI.          |

## Arquitectura

```text
src/
  instrumentation.ts      primer import de main.ts: valida el entorno e inicia OpenTelemetry
  main.ts                 arranque: crea la app, aplica configureApp y escucha
  app.module.ts           composición: config, rate limit, módulos y providers globales
  app.setup.ts            Helmet, CORS, body limit, versionado /v1, Swagger (compartido con e2e)
  config/                 ConfigModule y validación de variables al arrancar
  modules/health/         /health/live y /health/ready
  modules/<módulo>/
    domain/               entidades y value objects puros (sin NestJS, ORM ni AWS)
    application/          casos de uso y puertos (interfaces + tokens de DI)
    infrastructure/       adaptadores que implementan los puertos
    presentation/http/    controllers y DTOs de entrada y salida
    <módulo>.module.ts    conecta puertos con adaptadores mediante tokens
  shared/
    domain/               value objects comunes (Money)
    errors/               jerarquía de errores, sin dependencia de HTTP
    application/ports/    puertos transversales (verificación de access token)
    infrastructure/       adaptadores transversales (auth; observability: telemetría y logger)
    presentation/         filter, interceptores, pipe, guard, decoradores
test/
  unit/                   dominio, casos de uso y piezas HTTP aisladas
  integration/            adaptadores con NestJS real (ConfigModule)
  e2e/                    contrato HTTP de punta a punta
  support/                createTestApp y dobles de prueba
```

### Reglas de dependencia

Las verifica ESLint (`no-restricted-imports` en [eslint.config.mjs](eslint.config.mjs)); romperlas falla `npm run lint`.

| Capa             | No puede importar                                                          |
| ---------------- | -------------------------------------------------------------------------- |
| `domain`         | otras capas, `config`, NestJS, class-validator, rxjs, express, ORMs ni AWS |
| `application`    | `infrastructure`, `presentation`, express, ORMs ni AWS                     |
| `infrastructure` | `presentation`                                                             |

Además:

- Solo `src/config` y `main.ts` leen `process.env`. El resto usa `ConfigService`.
- En `src` se usan imports relativos. Los alias `@src/*` y `@test/*` existen solo en las pruebas.

### Recorrido de una petición

```mermaid
sequenceDiagram
  participant C as Cliente
  participant MW as Express (traceId, Helmet, CORS, body-parser)
  participant G as Guards (Throttler → BearerAuth)
  participant I as Interceptores (Timeout, Envelope)
  participant P as ValidationPipe
  participant Ctl as Controller
  participant UC as Caso de uso
  participant Port as Puerto
  participant Ad as Adaptador

  C->>MW: GET /v1/circles/join-config
  MW->>G: request + traceId
  G->>G: rate limit por IP; Bearer → AccessTokenVerifierPort
  G->>I: principal en request
  I->>P: DTOs de entrada (si hay)
  P->>Ctl: datos validados
  Ctl->>UC: execute(principal)
  UC->>Port: getForUser(userId)
  Port->>Ad: ConfigJoinConfigRepository
  Ad-->>UC: JoinConfig (dominio)
  UC-->>Ctl: JoinConfig
  Ctl-->>I: JoinConfigResponse (DTO)
  I-->>C: { success: true, data, traceId }
  Note over G,Ad: Cualquier excepción → AllExceptionsFilter → { success: false, error, traceId }
```

### Cómo agregar un módulo

1. **Dominio** en `domain/`: entidades y value objects que validan sus invariantes y lanzan `DomainError` con un código estable.
2. **Puerto** en `application/ports/`: interfaz más `Symbol` como token de DI.
3. **Caso de uso** en `application/use-cases/`: inyecta el puerto con `@Inject(TOKEN)`.
4. **Adaptador** en `infrastructure/`: implementa el puerto.
5. **Controller y DTOs** en `presentation/http/`. Los DTOs de entrada usan class-validator; los de salida mapean desde el dominio.
6. **Módulo** con `{ provide: TOKEN, useExisting: Adaptador }`, importado en `AppModule`.
7. **Pruebas:** unitarias del dominio y del caso de uso (puerto mockeado), integración del adaptador y e2e del endpoint.

[src/modules/circles](src/modules/circles) es la referencia.

## Contrato HTTP

- **Versionado** por URI: `/v1/...`. Una ruta sin versión responde 404.
- **Éxito:** `{ "success": true, "data": ..., "traceId": "..." }`. Las respuestas 204 van sin cuerpo.
- **Error:** `{ "success": false, "error": { "code", "message", "details"? }, "traceId": "..." }`.
- **Trace id:** cada respuesta incluye la cabecera `x-trace-id`, que es el trace id de OpenTelemetry. Con él se busca la traza y sus logs en New Relic.
- **Autenticación:** todas las rutas exigen `Authorization: Bearer <token>`, salvo las marcadas con `@Public()`.
  - Hasta que exista el módulo auth (COPAYNI-19 y 20), el verificador de producción rechaza todos los tokens, así que ninguna ruta protegida queda abierta.
  - Las pruebas e2e lo reemplazan por un doble.

| Origen del error                      | HTTP | `error.code`                                 |
| ------------------------------------- | ---- | -------------------------------------------- |
| DTO inválido o campos no declarados   | 400  | `VALIDATION_ERROR` (con `details` por campo) |
| JSON mal formado                      | 400  | `BAD_REQUEST`                                |
| Sin token o token inválido            | 401  | `UNAUTHORIZED`                               |
| `ForbiddenError`                      | 403  | `FORBIDDEN`                                  |
| Ruta o recurso inexistente            | 404  | `NOT_FOUND`                                  |
| `ConflictError`                       | 409  | código propio                                |
| Petición que supera `REQUEST_TIMEOUT` | 408  | `REQUEST_TIMEOUT`                            |
| Cuerpo mayor que `BODY_LIMIT`         | 413  | `PAYLOAD_TOO_LARGE`                          |
| Regla de negocio (`DomainError`)      | 422  | código propio, p. ej. `OTP_INVALID`          |
| Rate limit                            | 429  | `RATE_LIMITED`, con cabecera `Retry-After`   |
| `InfrastructureError`                 | 503  | `INFRASTRUCTURE_ERROR`, con mensaje genérico |
| Readiness con una dependencia caída   | 503  | `SERVICE_UNAVAILABLE`, sin decir cuál        |
| Cualquier otro error                  | 500  | `INTERNAL_ERROR`, con mensaje genérico       |

Los errores 5xx se registran con su causa y su trace id. Al cliente nunca le llegan stack traces ni mensajes internos.

Endpoints implementados: [docs/api/circles.md](../../docs/api/circles.md). Con `ENABLE_SWAGGER=true`, la especificación OpenAPI está en `/docs` y `/docs-json`.

## Variables de entorno

Se validan al arrancar ([src/config/env.validation.ts](src/config/env.validation.ts)). Si alguna es inválida:

- la API no inicia;
- el error nombra cada variable y la regla que incumple;
- nunca muestra su valor.

| Variable                                                  | Defecto                                     | Uso                                                                                             |
| --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                | `development`                               | `development`, `test` o `production`.                                                           |
| `PORT`                                                    | `3000`                                      |                                                                                                 |
| `APP_NAME` / `APP_VERSION`                                | `ayni-api` / `0.1.0`                        | Título y versión de OpenAPI.                                                                    |
| `LOG_LEVEL`                                               | `info`                                      | `debug`, `info`, `warn`, `error` o `fatal`.                                                     |
| `CORS_ALLOWED_ORIGINS`                                    | vacío                                       | URLs separadas por comas. La app mobile no usa CORS.                                            |
| `TRUST_PROXY`                                             | `false`                                     | `true` detrás de API Gateway o de un balanceador, para que el rate limit vea la IP real.        |
| `REQUEST_TIMEOUT`                                         | `30000`                                     | Milisegundos.                                                                                   |
| `BODY_LIMIT`                                              | `100kb`                                     | Tamaño máximo del JSON.                                                                         |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX`                       | `60000` / `100`                             | Ventana en ms y solicitudes por IP.                                                             |
| `ENABLE_SWAGGER`                                          | `false`                                     | Expone `/docs`.                                                                                 |
| `DEPLOYMENT_ENVIRONMENT`                                  | `local`                                     | Ambiente en trazas, métricas y logs: `local`, `dev`, `staging`, `prod`.                         |
| `ENABLE_TRACING`                                          | `false`                                     | Exporta trazas por OTLP.                                                                        |
| `ENABLE_METRICS`                                          | `false`                                     | Exporta métricas (duración de peticiones HTTP) por OTLP.                                        |
| `ENABLE_LOGGING`                                          | `false`                                     | Exporta los logs por OTLP. Los logs JSON por stdout se escriben siempre.                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                             | vacío                                       | Endpoint OTLP/HTTP base. Obligatorio si algún `ENABLE_*` es `true`.                             |
| `NEW_RELIC_LICENSE_KEY`                                   | vacío                                       | **Secreto.** License key de ingesta; se envía como cabecera `api-key`.                          |
| `DEFAULT_CURRENCY`                                        | obligatoria                                 | ISO 4217 (pending-scope M1; PEN propuesto).                                                     |
| `JOIN_PAYOUT_MIN` / `MAX` / `STEP`                        | obligatorias                                | Rango del payout, en unidades menores. Debe ser alcanzable en saltos completos.                 |
| `SAVING_PROGRAM_MAX`                                      | obligatoria                                 | Máximo del programa de ahorro, en unidades menores.                                             |
| `DB_HOST` / `DB_NAME`                                     | obligatorias                                | PostgreSQL.                                                                                     |
| `DB_PORT`                                                 | `5432`                                      |                                                                                                 |
| `DB_USERNAME` / `DB_PASSWORD`                             | obligatorias                                | **`DB_PASSWORD` es secreto.** En AWS llegan de Secrets Manager.                                 |
| `DB_SSL` / `DB_SSL_CA`                                    | `false` / vacío                             | TLS verificando el servidor (RDS lo exige). `DB_SSL_CA`: bundle de CA de RDS en PEM.            |
| `DB_POOL_MAX`                                             | `10`                                        | Conexiones máximas por instancia de la API.                                                     |
| `CIRCLE_ASSIGNMENT_STRATEGY`                              | `fill_oldest`                               | Qué círculo se ofrece (R2, provisional): `fill_oldest` o `always_new`. Ver docs/api/circles.md. |
| `CIRCLE_START_OFFSET_MONTHS`                              | `1`                                         | Meses hasta el inicio de un círculo nuevo.                                                      |
| `BUSINESS_TIME_ZONE`                                      | `America/Lima`                              | Zona IANA que define el mes actual.                                                             |
| `SLOT_FASTEST_SHARE_BPS` / `SLOT_HIGHEST_SHARE_BPS`       | `2500` / `2500`                             | Parte de los slots con fee y con descuento (R1, provisional).                                   |
| `SLOT_MAX_FEE_BPS` / `SLOT_MAX_DISCOUNT_BPS`              | `1000` / `500`                              | Fee del primer slot y descuento del último, sobre el payout.                                    |
| `ADMIN_FEE_BPS` / `ADMIN_FEE_MODE`                        | `1200` / `added_to_installments`            | Admin Fees (R4): sumadas a las cuotas o descontadas del payout.                                 |
| `PAYOUT_METHODS`                                          | `digital_wallet,prepaid_card,bank_transfer` | Métodos de cobro que se muestran, en orden (T5, provisional).                                   |
| `PAYOUT_METHODS_UNAVAILABLE` / `PAYOUT_METHODS_NO_CHARGE` | vacío / `prepaid_card,bank_transfer`        | Deshabilitados y con badge "No Charge".                                                         |
| `PAYOUT_PREPAID_CARD_LIMIT`                               | `10000000`                                  | Límite de la tarjeta prepago, en unidades menores.                                              |
| `JOIN_IDENTITY_CHECK`                                     | `assume_verified`                           | National ID al unirse, hasta el KYC (COPAYNI-47): `assume_verified` o `assume_unverified`.      |
| `JOIN_MONTHLY_PAYIN_LIMIT`                                | `0`                                         | Límite mensual de pay-in (R5, provisional), en unidades menores; 0 = sin límite.                |
| `JWT_PRIVATE_KEY`                                         | efímera fuera de prd                        | **Secreto.** PEM P-256 para firmar los access tokens. Obligatoria en production.                |
| `JWT_KEY_ID` / `ISSUER` / `AUDIENCE`                      | `ayni-1` / `ayni-api` / `ayni-mobile`       | `kid`, `iss` y `aud` del JWT.                                                                   |
| `ACCESS_TOKEN_TTL_SECONDS`                                | `900`                                       | Vida del access token.                                                                          |
| `REFRESH_TOKEN_TTL_DAYS`                                  | `30`                                        | Vida del refresh token.                                                                         |
| `OTP_PEPPER`                                              | efímero fuera de prd                        | **Secreto** (32+ caracteres) para el hash de los OTP. Obligatorio en production.                |
| `OTP_CODE_TTL_SECONDS` … `OTP_MAX_RESENDS`                | `300`, `30`, `5`, `3`                       | Vigencia, plazo de reenvío, intentos y reenvíos (R10, provisionales).                           |
| `OTP_START_MAX_PER_WINDOW` / `WINDOW_SECONDS`             | `5` / `900`                                 | Inicios por identificador en la ventana.                                                        |
| `OTP_DEV_CODE`                                            | vacío                                       | Solo desarrollo: código fijo y sin envío. Prohibido en production.                              |

**Secretos:**

- Nunca se versionan: `.gitignore` excluye `.env*` salvo `.env.example`.
- En los ambientes desplegados llegan del gestor de secretos (definido en COPAYNI-11).

## Observabilidad

### Qué se genera

- **Trazas:**
  - Un span de servidor por petición (instrumentación HTTP). El nombre lleva la ruta, p. ej. `GET /v1/circles/join-config`.
  - Un span hijo por controller (instrumentación NestJS).
  - Express solo aporta la ruta: no crea spans por middleware ni por handler, para no duplicar.
  - Los health checks no se trazan.
- **Métricas:** `http.server.request.duration` (instrumentación HTTP), con temporalidad delta, que es la que procesa New Relic.
- **Logs:** JSON por stdout, una línea por evento, con `level`, `time`, `service`, `version`, `env`, `context` y `message`.
  - Dentro de una petición llevan `traceId` y `spanId`.
  - Cada petición deja una línea `HTTP` con método, ruta sin query string, estado y duración. La de los health checks solo sale con `LOG_LEVEL=debug`.
  - Se redactan como `[REDACTED]`, hasta tres niveles de anidamiento ([logger.ts](src/shared/infrastructure/observability/logger.ts)):
    - credenciales: `authorization`, `cookie`, contraseñas, tokens, `apiKey`, `secret`;
    - OTP y `pin`;
    - `documentNumber`;
    - datos de tarjeta: `cardNumber`, `pan`, `cvv` y `cvc`.
  - Con `ENABLE_LOGGING=true` también se exportan por OTLP, ya redactados.
- **Resource:** `service.name` (`APP_NAME`), `service.version` (`APP_VERSION`) y `deployment.environment.name` (`DEPLOYMENT_ENVIRONMENT`).

Las trazas se generan aunque `ENABLE_TRACING=false`: así el trace id existe para `x-trace-id` y para los logs. Cada flag decide solo si esa señal se envía.

### Inicialización

[src/instrumentation.ts](src/instrumentation.ts) es el primer import de `main.ts`:

1. Carga `.env` si existe; las variables del entorno tienen prioridad.
2. Valida el entorno con la misma clase que ConfigModule. Si falla, termina con código 1 sin mostrar valores.
3. Registra los providers y las instrumentaciones antes de que se carguen http, express, NestJS y pino.

Al cerrar (SIGTERM), `TelemetryShutdown` envía lo pendiente y espera como máximo 5 segundos. Así un collector que no responde no consume el periodo de gracia del orquestador.

### New Relic

Se usa OTLP/HTTP con protobuf y gzip, que es lo que recomienda New Relic.

| Variable                      | Valor                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `https://otlp.nr-data.net:4318` (cuenta en EE. UU.) o `https://otlp.eu01.nr-data.net:4318` (cuenta en la UE) |
| `NEW_RELIC_LICENSE_KEY`       | License key de ingesta (tipo _Ingest - License_) de la cuenta                                                |

- La región y la key dependen de la cuenta de New Relic del proyecto: hay que confirmarlas con quien la administra.
- La key llega del gestor de secretos (COPAYNI-11). Nunca se versiona ni se registra en los logs.
- El endpoint es el base: el exporter agrega `/v1/traces`, `/v1/metrics` y `/v1/logs`.
- Sin license key sirve para cualquier collector OTLP, p. ej. uno local.

### Verificar la conectividad del exporter

1. Arrancar con los flags, el endpoint y la key del ambiente:

   ```bash
   ENABLE_TRACING=true ENABLE_METRICS=true ENABLE_LOGGING=true \
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net:4318 NEW_RELIC_LICENSE_KEY=... npm run start:prod
   ```

2. Hacer una petición y anotar su `x-trace-id`:

   ```bash
   curl -si http://localhost:3000/v1/circles/join-config | grep -i x-trace-id
   ```

3. Revisar stderr. Los errores de exportación salen como JSON con `"context":"OpenTelemetry"`, sin la key:
   - Código `401` o `403`: la license key es inválida o no corresponde a la región del endpoint.
   - `ECONNREFUSED` o `ENOTFOUND`: el endpoint es inaccesible desde la red del servicio.
   - Sin errores tras unos 5 segundos (trazas y logs) o 60 segundos (métricas): los envíos se aceptaron.
4. En New Relic (APM & Services → `ayni-api` → Distributed tracing), buscar la traza con `trace.id` igual al `x-trace-id`.
5. Abrir _Logs_ desde esa traza: deben aparecer los logs de la petición con el mismo trace id.

Sin cuenta de New Relic, el mismo flujo funciona contra un collector OTLP local (p. ej. `otel/opentelemetry-collector` con el exporter `debug`), con `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` y sin key.

### Health checks

| Ruta            | Responde 200 cuando…                      | Uso                                                                 |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `/health/live`  | el proceso atiende peticiones             | Liveness: si falla, el orquestador reinicia el contenedor.          |
| `/health/ready` | todas las dependencias críticas responden | Readiness: si falla (503), el balanceador deja de enviarle tráfico. |

- Sin versión, sin autenticación y sin rate limit.
- La respuesta es `{ "status": "ok" }`, sin versiones, dependencias ni tiempos.
- Liveness no consulta dependencias: si la base de datos cae, reiniciar la API no lo resuelve.
- Readiness consulta los `ReadinessIndicator` registrados en [HealthModule](src/modules/health/health.module.ts):
  - en paralelo, con 2 segundos como máximo cada uno;
  - qué indicador falló queda en un log `warn`, nunca en la respuesta.
- Indicadores: PostgreSQL (`SELECT 1`).

## Dominio de círculos (COPAYNI-24)

Código en [src/modules/circles/domain](src/modules/circles/domain); `Money` y `Period` están en `src/shared/domain`.

| Pieza                | Responsabilidad                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `Money`              | Céntimos enteros, porcentajes en puntos básicos y `allocate(n)`: reparto exacto, sin céntimos perdidos. |
| `Period`             | Mes calendario (`YYYY-MM`) para cuotas y payouts.                                                       |
| `CircleTerms`        | Payout, meses y mes de inicio. Hay un slot por mes y la cuota base es `payout / meses`, exacta.         |
| `installmentOptions` | Combinaciones cuota × meses de un payout.                                                               |
| `SlotPricingRules`   | **Todos los parámetros que pueden cambiar** (pending-scope R1 y R4), en puntos básicos.                 |
| `SlotPricing`        | Tipo de cada slot, fee, descuento, Admin Fees, las cuotas de cada mes, total pagado y payout neto.      |
| `Circle`             | Agregado: un miembro por slot, un slot por usuario, unión idempotente por clave.                        |
| `JoinCircleUseCase`  | Valida con el círculo y delega la atomicidad en `CircleRepositoryPort.addMembership`.                   |

**Reglas del Figma (55:9444):**

- Los primeros slots (Fastest Payout) pagan fee; los intermedios (Lowest Fees), no; los últimos (Highest Return) reciben descuento.
- Las Admin Fees se reparten en partes iguales hasta el mes de payout.

**Supuestos provisionales, a validar con el PO:**

- **Fee y descuento:**
  - El fee del primer slot es `maxFeeBps` del payout y baja linealmente hasta el último slot Fastest.
  - El descuento sube linealmente hasta `maxDiscountBps` en el último slot.
- **Reparto:** el fee del slot se reparte, como las Admin Fees, en las cuotas hasta el mes de payout. El descuento se reparte entre todas las cuotas.
- **Admin Fees** (`adminFeeMode`): sumadas a las cuotas (`added_to_installments`) o descontadas del payout (`deducted_from_payout`), según se resuelva R4. Con 12 %, 24.000 da 2.880, como en la tarjeta del Figma.
- **Duraciones:** solo se ofrecen las que dan cuotas exactas en céntimos.

Cambiar una fórmula toca `SlotPricing` y sus pruebas, sin afectar al resto del dominio.

**Concurrencia:**

- El agregado valida contra el estado leído.
- La barrera final es la inserción del repositorio con unicidad por (círculo, slot), (círculo, usuario) y (círculo, clave). Así solo chocan las solicitudes que compiten por lo mismo: doce usuarios pueden unirse a la vez a slots distintos.
- Si gana otra solicitud con la misma clave, el caso de uso relee y devuelve esa membresía.
- [La prueba de concurrencia](test/integration/modules/circles/join-circle.concurrency.spec.ts) usa un doble con esa semántica, y [la del adaptador](test/integration/modules/circles/typeorm-circle.repository.spec.ts) repite las mismas carreras contra PostgreSQL.
- Si el mismo pedido llega dos veces a la vez, PostgreSQL puede reportar primero el índice del slot o del usuario. El adaptador comprueba la clave antes de traducir el error, así el reintento se trata como tal.

**Pendiente:**

- Endpoint de círculos recomendados y la unión por HTTP (COPAYNI-31): la unión creará el círculo nuevo que ofrece `slots` (`circleId: null`).
- La regla de asignación (R2) es provisional: cambiarla toca `GetAvailableSlotsUseCase` y `findOldestJoinable`.
- Origen de los parámetros de precio: por círculo en la base de datos o por configuración.
- Formación de los círculos (R2) y mora (R3).

## Autenticación (COPAYNI-19, 20 y 21)

Módulo [auth](src/modules/auth), sobre el módulo [users](src/modules/users). Contrato: [docs/api/auth.md](../../docs/api/auth.md).

| Pieza                         | Responsabilidad                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `LoginIdentifier`             | Email en minúsculas o teléfono E.164; enmascarado para la respuesta. Mismas reglas que mobile.                            |
| `AuthChallenge`               | Intentos, bloqueo al agotarlos, vencimiento y reenvíos con plazo. El código solo existe como hash.                        |
| `HmacOtpHasher`               | HMAC-SHA256 con `OTP_PEPPER` sobre desafío y código; comparación en tiempo constante.                                     |
| `Es256JwtIssuer` / `Verifier` | JWT ES256 con `node:crypto`. Solo acepta `alg: ES256` y su `kid`; valida emisor, audiencia y vigencia (30 s de margen).   |
| Refresh tokens                | 32 bytes aleatorios; en la base, su SHA-256. Rotación en un `UPDATE` condicional; un token reutilizado revoca la familia. |

**Concurrencia:**

- Los intentos sobre un desafío se serializan con `SELECT … FOR UPDATE`: diez intentos simultáneos descuentan exactamente los cinco disponibles.
- De dos renovaciones simultáneas con el mismo refresh token, una vale y la otra se trata como reutilización.
- Dos inicios simultáneos con el mismo email obtienen el mismo usuario (índice único).

**Seguridad:**

- La respuesta de `start` es igual exista o no el usuario.
- Los logs registran eventos (`auth.challenge_issued`, `auth.otp_verified`, `auth.otp_rejected`, `auth.refresh_reuse_detected`) con el id del usuario, nunca el identificador, el código ni los tokens.
- `RATE_LIMITED` lleva `Retry-After` en segundos; el límite por identificador vive en la base, no en memoria.

**Secretos:** `JWT_PRIVATE_KEY` (PEM P-256) y `OTP_PEPPER` son obligatorios en production y llegan de Secrets Manager. Fuera de production, si faltan, se generan al arrancar y dejan de valer al reiniciar. Para fijar una clave local:

```bash
openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt
```

**Pendiente:**

- Proveedor de envío de OTP (T6): mientras tanto, sin `OTP_DEV_CODE` el envío responde 503.
- "Remember Me" y la duración de las sesiones (R10, COPAYNI-21).
- Rotación de la clave JWT: hoy se acepta un solo `kid`.

## Persistencia

PostgreSQL 17 (ADR 2, [docs/architecture.md](../../docs/architecture.md)) con **TypeORM**.

- **Capas:** las entidades TypeORM viven en `infrastructure/persistence/typeorm` de cada módulo y se convierten al dominio en el repositorio. El dominio y la aplicación no importan TypeORM (lo verifica ESLint).
- **Conexión:** [DatabaseModule](src/shared/infrastructure/persistence/database.module.ts), global. Cada módulo registra sus entidades con `TypeOrmModule.forFeature`.
- **Esquema:** solo cambia con migraciones en [migrations](src/shared/infrastructure/persistence/migrations), listadas en orden en `index.ts`. Nunca `synchronize`. El historial está en la tabla `schema_migrations`.
- **Migraciones en AWS:** `node dist/migrate.js` como tarea ECS de una sola vez antes de actualizar el servicio. Cada migración corre en su propia transacción.
- **Restricciones en la base:** montos positivos, cuota exacta, mes de inicio el día 1 y los índices únicos de las membresías. La base rechaza un dato inválido aunque un adaptador falle.
- **Sin logs de consultas:** pueden llevar datos personales. Cada consulta tiene un máximo de 10 s (`statement_timeout`).

**Pruebas:**

- [global-setup.ts](test/global-setup.ts) vacía la base `ayni_test` y aplica todas las migraciones desde cero en cada corrida, así también se prueban las migraciones.
- Las pruebas usan ids aleatorios y no comparten filas: los archivos corren en paralelo sin limpiar entre ellos.
- En CI, PostgreSQL corre como service del job `backend`.

**Pendiente (COPAYNI-12):**

- Pasar `DB_*` a la task definition: la contraseña desde Secrets Manager y `DB_SSL_CA` con el bundle de RDS.
- Crear el usuario de la API con permisos mínimos, distinto del administrador, y la tarea ECS de migraciones en el pipeline.

## Uso local con la app mobile

Sin desplegar: la app apunta al backend de esta máquina.

```bash
# Backend
cd apps/backend
cp .env.example .env    # trae OTP_DEV_CODE=1234
npm run db:up && npm run migrate:dev && npm run start:dev
```

En `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://<host>:3000/v1
EXPO_PUBLIC_AUTH_API=http
EXPO_PUBLIC_CIRCLES_API=http
EXPO_PUBLIC_PROFILE_API=http
EXPO_PUBLIC_PAYOUTS_API=http
```

- `<host>`: `localhost` en iOS Simulator o web, `10.0.2.2` en el emulador de Android, o la IP de la máquina en la red local con un teléfono físico (Expo Go).
- El código OTP es `1234` para cualquier email o teléfono. La clave JWT es efímera: al reiniciar el backend, la app pide ingresar de nuevo.
- Para ver slots ocupados hay que crear un círculo con membresías: la unión por HTTP llega con COPAYNI-31.

## Imagen de contenedor

El [Dockerfile](Dockerfile) genera la imagen que corre en ECS Fargate, tanto en dev (emulador floci) como en prd ([infra/terraform](../../infra/terraform/README.md)).

```bash
docker build -t ayni-api:local .
```

- **Etapas:** `build` compila e instala solo las dependencias de producción; `runtime` contiene `node_modules`, `dist` y el usuario `node` (sin root).
- **Configuración:** llega por variables de entorno y secretos de la task definition. La imagen no incluye ningún `.env`.
- **Sistema de archivos:** la task definition lo monta como solo lectura. El health check del contenedor usa `/health/live`.

## Decisiones y limitaciones

- **NestJS 11 en lugar de 12:**
  - NestJS 12 se publica solo como ESM, y Jest no puede cargar ESM desde CommonJS con Node 22.
  - El CLI de Nest 12 tampoco arranca en Node 22.13.
  - Por eso se compila con `tsc` y se desarrolla con `tsc-watch`, sin el CLI de Nest.
  - Migrar a 12 implica pasar el proyecto a ESM o usar Node 24.9 o superior.
- **TypeScript 6.0:** ts-jest y typescript-eslint todavía no soportan TypeScript 7.
- **`overrides` en package.json:** fuerzan `multer` 2.5 y `js-yaml` 5.4+, que corrigen vulnerabilidades (GHSA-q7qp-rjg7-q26m, GHSA-r3ph-w7gj-g6xm) de las dependencias de `@nestjs/platform-express` y `@nestjs/swagger` 11. Se pueden quitar cuando esos paquetes publiquen versiones corregidas.
- **Rate limit en memoria:** sirve para una sola instancia. Con varias réplicas o con Lambda necesita un almacenamiento compartido (COPAYNI-11).
- **`@nestjs/typeorm` 11 en lugar de 12:** la 12 se publica solo como ESM, igual que NestJS 12. La 11 admite TypeORM 1.x.
- **Montos desde configuración:** `join-config` se lee de variables validadas hasta que los montos pasen a la base de datos. `userPayoutLimit` es `null` hasta definir el límite por usuario (pending-scope R5).
- **OpenTelemetry 2.x (SDK 2.12, instrumentaciones 0.223):**
  - La línea 3.x exige Node 22.15 o superior, y el proyecto fija 22.13.
  - `@opentelemetry/api` queda en 1.9 porque el SDK 2.12 no admite 1.10.
- **Providers armados a mano en lugar de `@opentelemetry/sdk-node`:** sdk-node agrega gRPC, Zipkin y Prometheus, y configura exporters desde variables `OTEL_*` por su cuenta. Así toda la configuración pasa por la validación de entorno.
- **Jest con `--experimental-vm-modules`:** los exporters OTLP cargan `http` con `import()` dinámico, que Jest solo admite con ese flag. Las pruebas siguen siendo CommonJS.
- **Las instrumentaciones no aplican dentro de Jest**, porque Jest usa su propio cargador de módulos.
  - Las pruebas cubren la exportación OTLP contra un collector falso y la correlación de logs con spans manuales.
  - La forma de las trazas HTTP (un span de servidor por petición, sin duplicados) se verificó con el build en un proceso Node real.
- **Muestreo:** se trazan todas las peticiones (ParentBased + AlwaysOn). Si el volumen o el costo de New Relic lo exigen, se agrega un ratio por variable.
- **Propagación W3C:** se acepta el `traceparent` entrante, para continuar trazas que vienen de API Gateway o de otros servicios. Un cliente puede elegir su trace id, pero eso solo afecta a la correlación de su propia petición.
