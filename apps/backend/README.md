# Ayni API (backend)

API REST de Ayni: NestJS 11 + TypeScript strict con arquitectura hexagonal por módulos, siguiendo la guía _Backend Enterprise NestJS_.

**Estado:** fundaciones de COPAYNI-8, más el primer endpoint real (`GET /v1/circles/join-config`, que consume la app mobile). Fuera de este alcance:

- CI, Husky y commitlint: COPAYNI-9.
- OpenTelemetry, New Relic y health checks: COPAYNI-10.
- Despliegue AWS y base de datos: COPAYNI-11 y COPAYNI-12.

## Requisitos

- Node.js 22.13 o superior (`.nvmrc`) y npm 10.
- Sin servicios externos: todavía no hay base de datos.

```bash
cd apps/backend
npm install
cp .env.example .env   # valores de desarrollo, sin secretos
npm run start:dev      # http://localhost:3000, Swagger en /docs si ENABLE_SWAGGER=true
```

## Scripts

| Script                      | Qué hace                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `start:dev` / `start:debug` | Compila en modo watch y reinicia la API (`--inspect` en debug).                        |
| `build`                     | Compila `src` a `dist` con `tsconfig.build.json`.                                      |
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
  main.ts                 arranque: crea la app, aplica configureApp y escucha
  app.module.ts           composición: config, rate limit, módulos y providers globales
  app.setup.ts            Helmet, CORS, body limit, versionado /v1, Swagger (compartido con e2e)
  config/                 ConfigModule y validación de variables al arrancar
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
    infrastructure/       adaptadores transversales
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
- **Trace id:** cada respuesta incluye la cabecera `x-trace-id` (generada por el servidor; con COPAYNI-10 será el trace id de OpenTelemetry).
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
| Cualquier otro error                  | 500  | `INTERNAL_ERROR`, con mensaje genérico       |

Los errores 5xx se registran con su causa y su trace id. Al cliente nunca le llegan stack traces ni mensajes internos.

Endpoints implementados: [docs/api/circles.md](../../docs/api/circles.md). Con `ENABLE_SWAGGER=true`, la especificación OpenAPI está en `/docs` y `/docs-json`.

## Variables de entorno

Se validan al arrancar ([src/config/env.validation.ts](src/config/env.validation.ts)). Si alguna es inválida:

- la API no inicia;
- el error nombra cada variable y la regla que incumple;
- nunca muestra su valor.

| Variable                            | Defecto              | Uso                                                                                      |
| ----------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development`        | `development`, `test` o `production`.                                                    |
| `PORT`                              | `3000`               |                                                                                          |
| `APP_NAME` / `APP_VERSION`          | `ayni-api` / `0.1.0` | Título y versión de OpenAPI.                                                             |
| `LOG_LEVEL`                         | `info`               | `debug`, `info`, `warn`, `error` o `fatal`.                                              |
| `CORS_ALLOWED_ORIGINS`              | vacío                | URLs separadas por comas. La app mobile no usa CORS.                                     |
| `TRUST_PROXY`                       | `false`              | `true` detrás de API Gateway o de un balanceador, para que el rate limit vea la IP real. |
| `REQUEST_TIMEOUT`                   | `30000`              | Milisegundos.                                                                            |
| `BODY_LIMIT`                        | `100kb`              | Tamaño máximo del JSON.                                                                  |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX` | `60000` / `100`      | Ventana en ms y solicitudes por IP.                                                      |
| `ENABLE_SWAGGER`                    | `false`              | Expone `/docs`.                                                                          |
| `DEFAULT_CURRENCY`                  | obligatoria          | ISO 4217 (pending-scope M1; PEN propuesto).                                              |
| `JOIN_PAYOUT_MIN` / `MAX` / `STEP`  | obligatorias         | Rango del payout, en unidades menores. Debe ser alcanzable en saltos completos.          |
| `SAVING_PROGRAM_MAX`                | obligatoria          | Máximo del programa de ahorro, en unidades menores.                                      |

**Secretos:**

- Nunca se versionan: `.gitignore` excluye `.env*` salvo `.env.example`.
- En los ambientes desplegados llegan del gestor de secretos (definido en COPAYNI-11).

## Decisiones y limitaciones

- **NestJS 11 en lugar de 12:**
  - NestJS 12 se publica solo como ESM, y Jest no puede cargar ESM desde CommonJS con Node 22.
  - El CLI de Nest 12 tampoco arranca en Node 22.13.
  - Por eso se compila con `tsc` y se desarrolla con `tsc-watch`, sin el CLI de Nest.
  - Migrar a 12 implica pasar el proyecto a ESM o usar Node 24.9 o superior.
- **TypeScript 6.0:** ts-jest y typescript-eslint todavía no soportan TypeScript 7.
- **`overrides` en package.json:** fuerzan `multer` 2.5 y `js-yaml` 5.4+, que corrigen vulnerabilidades (GHSA-q7qp-rjg7-q26m, GHSA-r3ph-w7gj-g6xm) de las dependencias de `@nestjs/platform-express` y `@nestjs/swagger` 11. Se pueden quitar cuando esos paquetes publiquen versiones corregidas.
- **Rate limit en memoria:** sirve para una sola instancia. Con varias réplicas o con Lambda necesita un almacenamiento compartido (COPAYNI-11).
- **Montos desde configuración:** `join-config` se lee de variables validadas mientras no haya base de datos. `userPayoutLimit` es `null` hasta definir el límite por usuario (pending-scope R5).
- **Logs:** por ahora se usa el logger de NestJS. Los logs estructurados correlacionados con trazas llegan con COPAYNI-10.
