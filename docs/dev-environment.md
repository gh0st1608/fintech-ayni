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

## Limitaciones conocidas

- **Datos:** no hay datos semilla. Los círculos se crean al unirse desde la app; para ver turnos ocupados hay que unir a varios usuarios.
- **Rate limit:** con el gateway, todas las peticiones llegan con la IP del gateway, así que el límite de peticiones es compartido. En dev no afecta, salvo en pruebas de carga.
- **Navegador:** las peticiones desde un navegador (Expo web) pasan por el aviso de ngrok del plan gratuito. Las de la app nativa no.
- **Development build:** los enlaces `ayni://invite?code=…` y el cambio LTR↔RTL necesitan un development build. En Expo Go el esquema es `exp://`. El proyecto todavía no tiene `eas.json`.
- **Producción:** el gateway y ngrok son solo para dev. En prd la app llega a la API por el ALB con dominio propio, y los documentos van a S3 real.
