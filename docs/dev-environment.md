# Ambiente dev: backend local y app en un teléfono

Cómo levantar la API, la base de datos y el almacenamiento de documentos en una máquina, y probarlos con la app mobile en un teléfono, por una URL pública de ngrok.

## Arquitectura

```text
Teléfono (Expo Go o development build)
   │  https://<tu-dominio>.ngrok-free.app
   ▼
ngrok  ──►  gateway (Caddy, :8080)
              ├── /v1/*, /health/*       ──►  API NestJS en la máquina (:3000)
              └── /<bucket>/*            ──►  floci (S3 emulado, :4566)
API ──► PostgreSQL 17 (Docker, :5432)
API ──► floci (S3) para comprobar las subidas
```

**Por qué hace falta el gateway:**

- **Un solo origen público para dos servicios.** La API firma las URLs de subida de documentos con el host público (`DOCUMENTS_S3_PUBLIC_ENDPOINT`). El gateway reenvía esas subidas a floci.
- **La firma de S3 sigue siendo válida.** El gateway no cambia la ruta ni el `Host`.
- **floci no es alcanzable desde la red.** Solo escucha en `127.0.0.1`.
- **La API dentro de floci tampoco sirve para la app.** El balanceador emulado no enruta a ECS, así que la app no puede llegar a la API desplegada ahí. Ese stack sirve para probar la infraestructura, no la app ([infra/terraform/README.md](../infra/terraform/README.md)).

## Requisitos

- Docker Desktop, Node.js 22.13+ y npm 10.
- Una cuenta gratuita de [ngrok](https://ngrok.com):
  - el **authtoken**;
  - el **dominio estático** gratuito. Con él la URL no cambia entre reinicios.
- En el teléfono:
  - **Expo Go (SDK 58)** para casi todo;
  - un _development build_ para los enlaces `ayni://invite` y el cambio a árabe (RTL). Ver "Limitaciones".

## Pasos

### 1. Contenedores: PostgreSQL, floci, gateway y ngrok

```bash
cp infra/local/.env.example infra/local/.env   # NGROK_AUTHTOKEN y NGROK_URL
docker compose -f infra/local/compose.yaml --profile tunnel up -d
(cd apps/backend && npm run db:up)
```

- Inspector de ngrok: <http://localhost:4040>.
- Para probar el gateway sin el túnel: <http://localhost:8080/health/live>.

### 2. Backend

```bash
cd apps/backend
npm install
cp .env.example .env
npm run dev:jwt-key >> .env        # la sesión sobrevive a los reinicios de la API
npm run dev:documents-bucket       # crea el bucket en floci
```

En `apps/backend/.env`, activar el almacenamiento en floci con la URL pública:

```bash
DOCUMENT_STORAGE=s3
DOCUMENTS_BUCKET=ayni-local-documents
DOCUMENTS_S3_ENDPOINT=http://127.0.0.1:4566
DOCUMENTS_S3_PUBLIC_ENDPOINT=https://<tu-dominio>.ngrok-free.app
# Credenciales de prueba de floci: nunca tu perfil de AWS.
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

```bash
npm run migrate:dev
npm run start:dev                  # http://localhost:3000
```

Comprobar el túnel: `curl https://<tu-dominio>.ngrok-free.app/health/live` debe responder `200`.

### 3. App mobile

```bash
cd apps/mobile
npm install
cp .env.example .env.local
```

En `apps/mobile/.env.local`, apuntar todo a la API real:

```bash
EXPO_PUBLIC_APP_ENV=dev
EXPO_PUBLIC_API_URL=https://<tu-dominio>.ngrok-free.app/v1
EXPO_PUBLIC_AUTH_API=http
EXPO_PUBLIC_CIRCLES_API=http
EXPO_PUBLIC_PROFILE_API=http
EXPO_PUBLIC_PAYOUTS_API=http
EXPO_PUBLIC_PAYMENTS_API=http
EXPO_PUBLIC_DOCUMENTS_API=http
EXPO_PUBLIC_REFERRALS_API=http
EXPO_PUBLIC_SAVINGS_API=http
# Mercado Pago sigue simulado: la app genera tokens falsos que la pasarela falsa del backend acepta.
EXPO_PUBLIC_PAYMENT_TOKENIZER=fake
```

```bash
npx expo start                     # escanear el QR con Expo Go
```

## Qué usar en las pruebas

| Para                                  | Valor                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Código OTP                            | `1234` para cualquier email o teléfono (`OTP_DEV_CODE`)                                                     |
| Tarjeta aprobada                      | Cualquier número válido, p. ej. `4509 9535 6623 3704`. Se guarda con su marca y sus últimos cuatro          |
| Tarjeta rechazada                     | `4000 0000 0000 0002`                                                                                       |
| Yape                                  | Cualquier celular de 9 dígitos con el código `123456`                                                       |
| Documentos                            | Se aprueban al enviarlos (`KYC_SIMULATED_RESULT=approved`; `rejected` o `in_review` para los otros estados) |
| Ciclo mensual (cobros, payouts, mora) | No corre solo: `cd apps/backend && node dist/jobs/circle-cycle.js`                                          |

### Con el sandbox de Mercado Pago

Para probar los cobros de verdad (sin dinero real), con las **credenciales de prueba** de la misma aplicación del [panel de Mercado Pago](https://www.mercadopago.com.pe/developers/panel/app):

- `apps/backend/.env`: `PAYMENT_GATEWAY=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN=TEST-…` y `MERCADOPAGO_WEBHOOK_SECRET=…`.
- `apps/mobile/.env.local`: `EXPO_PUBLIC_PAYMENT_TOKENIZER=mercadopago` y `EXPO_PUBLIC_MERCADOPAGO_PUBLIC_KEY=TEST-…`.

Nunca credenciales de producción (`APP_USR-…`) en desarrollo. Con una public key `TEST-` la app acepta los celulares de prueba de Yape, todos con el código `123456`:

| Celular                   | Resultado                                |
| ------------------------- | ---------------------------------------- |
| `111111111`               | Aprobado                                 |
| `111111112`               | Rechazado: `required_call_for_authorize` |
| `111111113`               | Rechazado: `insufficient_amount`         |
| `111111114`               | Rechazado: `processing_error`            |
| `111111115`               | Rechazado: `invalid_card_token`          |
| `111111116`               | Rechazado: `max_attempts_exceeded`       |
| `111111117` y `111111118` | Rechazado: `bad_filled_card_data`        |

La búsqueda de órdenes de Mercado Pago no funciona con credenciales de prueba: el backend lo avisa en el log (`payments.gateway.orders_search_unavailable`) y sigue solo con los pagos.

## Development build

Instala en el teléfono una app propia que carga el código desde Metro, como Expo Go, pero con el esquema `ayni://` y los módulos nativos del proyecto. Se compila en EAS, con el perfil `development` de `apps/mobile/eas.json`. Se recompila solo si cambian las dependencias nativas o `app.json`.

La primera vez hace falta una cuenta de [Expo](https://expo.dev):

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init            # vincula el proyecto y escribe su id en app.json
npx eas-cli@latest build --profile development --platform android
```

- **Identificadores:** el primer build pide el `package` de Android y el `bundleIdentifier` de iOS. Son definitivos una vez publicada la app en las tiendas: elegirlos con el nombre final de la marca (D15).
- **iOS:** necesita una cuenta de Apple Developer y registrar el dispositivo (`npx eas-cli@latest device:create`).

Con la app instalada:

```bash
npx expo start --dev-client        # escanear el QR con la app instalada
```

Usa el mismo `.env.local` que Expo Go: las variables `EXPO_PUBLIC_*` las inyecta Metro.

## Limitaciones conocidas

- **Datos:** no hay datos semilla. Los círculos se crean al unirse desde la app; para ver turnos ocupados hay que unir a varios usuarios.
- **Rate limit:** con el gateway, todas las peticiones llegan con la IP del gateway, así que el límite de peticiones es compartido. En dev no afecta, salvo en pruebas de carga.
- **Navegador:** las peticiones desde un navegador (Expo web) pasan por el aviso de ngrok del plan gratuito. Las de la app nativa no.
- **Development build:** los enlaces `ayni://invite?code=…` y el cambio LTR↔RTL no funcionan en Expo Go, donde el esquema es `exp://`. Ver "Development build".
- **Producción:** el gateway y ngrok son solo para dev. En prd la app llega a la API por el ALB con dominio propio, y los documentos van a S3 real.
