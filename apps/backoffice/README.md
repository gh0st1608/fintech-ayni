# Ayni · Back-office

Aplicación web interna para operar Ayni: operaciones revisa los documentos de KYC, el personal sigue las juntas y su ciclo, y el admin general las pausa o reanuda. Implementa las fases 1 y 2 (primer tramo) de [docs/backoffice-plan.md](../../docs/backoffice-plan.md), sobre la API `/admin/v1` de `apps/backend` documentada en [docs/api/admin.md](../../docs/api/admin.md).

Sigue la _Base técnica enterprise senior frontend web_: React 19, TypeScript estricto, Vite, React Router, TanStack Query, Tailwind CSS v4, Zod, Jest y React Testing Library.

## Qué incluye

| Pantalla         | Ruta                 | Roles                                             |
| ---------------- | -------------------- | ------------------------------------------------- |
| Inicio de sesión | `/login`             | —                                                 |
| Juntas           | `/circles?state=`    | `support`, `operations`, `finance`, `super_admin` |
| Detalle          | `/circles/:circleId` | Los mismos; pausar y reanudar solo `super_admin`  |
| Documentos (KYC) | `/kyc?status=&type=` | `operations`, `super_admin`                       |
| Revisión         | `/kyc/:id`           | Los mismos                                        |
| Personas         | `/users?q=`          | `support`, `operations`, `finance`, `super_admin` |
| Perfil           | `/users/:userId`     | Los mismos                                        |

- **Listado:** filtro por estado en la URL, paginación por cursor y turnos ocupados.
- **Detalle:** condiciones, mes en curso, propuesta de inicio reducido (ronda, plazo y respuestas) y miembros con sus datos personales **enmascarados por el backend**.
- **Revisión de documentos:** la cola va del más antiguo al más nuevo y marca los reemplazados por uno más reciente. Cada página se abre con una URL de 60 s que se pide al momento y queda en la auditoría. Aprobar admite corregir el ingreso del comprobante; rechazar exige un motivo del catálogo, cuyo texto ve la persona en la app. La nota interna solo queda en la auditoría. Si otra persona lo resolvió antes, se avisa y se recarga.
- **Personas:** búsqueda exacta por email completo, teléfono con código de país o id (no busca por partes). El perfil muestra los datos enmascarados, el estado de cada documento y sus juntas. Cada búsqueda queda en la auditoría sin el dato buscado.
- **Pausar y reanudar:** con motivo obligatorio, que queda en la auditoría del backend. Si la autenticación ya no es reciente (step-up), ofrece volver a iniciar sesión.
- **Estados de cada vista:** carga, vacío, error con reintento y código de seguimiento (`traceId`), y éxito.

## Arquitectura

```text
src/
├── domain/          Entidades, permisos por rol, errores y puertos. Sin React ni HTTP.
├── application/     Casos de uso: validan y orquestan los puertos.
├── infrastructure/  Cliente HTTP, esquemas Zod de la API y adaptadores de los puertos.
├── presentation/    Pantallas, componentes, hooks de TanStack Query, providers y rutas.
├── bootstrap/       Configuración validada y contenedor de dependencias.
└── main.tsx
```

```text
Pantalla → hook (TanStack Query) → caso de uso → puerto → adaptador → FetchHttpClient → /admin/v1
```

- **Límites entre capas:** los vigila ESLint (`no-restricted-imports`). El dominio no importa React; la presentación no importa adaptadores concretos.
- **Contrato con el backend:** cada respuesta se valida con Zod (`src/infrastructure/api/schemas.ts`). Un cambio incompatible falla con un error claro, no con datos a medias.
- **Permisos:** la UI no ofrece lo que el rol no puede hacer (`src/domain/staff/Staff.ts`), pero la autorización real es la del backend.

## Requisitos

- Node.js 22.13 o superior (`.nvmrc`) y npm.
- `apps/backend` con la API de administración.

## Ejecutar en local

1. En el backend (`apps/backend/.env`):

   ```bash
   STAFF_AUTH_PROVIDER=dev
   CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:5173
   ```

   Luego `npm run migrate:dev` y `npm run start:dev`.

2. En `apps/backoffice`:

   ```bash
   npm install
   cp .env.example .env.local
   npm run dev         # http://localhost:5173
   ```

3. Ingresa con cualquier email y los roles que quieras probar.

## Configuración

| Variable               | Descripción                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `VITE_API_URL`         | URL del backend, sin `/admin/v1`                                       |
| `VITE_AUTH_MODE`       | Por ahora solo `dev`. `oidc` llega con el proveedor de identidad (BO2) |
| `VITE_HTTP_TIMEOUT_MS` | Opcional; 15000 por defecto                                            |

Las variables `VITE_*` terminan en el bundle y son públicas: **nunca** secretos. Una configuración inválida muestra el error al abrir la app en vez de arrancar con valores por defecto.

## Scripts

| Script                  | Qué hace                                                            |
| ----------------------- | ------------------------------------------------------------------- |
| `npm run dev`           | Servidor de desarrollo                                              |
| `npm run build`         | Typecheck y build de producción en `dist/`                          |
| `npm run lint`          | ESLint con reglas estrictas y límites de capas                      |
| `npm run typecheck`     | TypeScript sin emitir                                               |
| `npm run format:check`  | Prettier                                                            |
| `npm run test`          | Jest y React Testing Library                                        |
| `npm run test:coverage` | Con umbrales: 90 % de sentencias, funciones y líneas; 85 % de ramas |
| `npm run validate`      | Todo lo anterior, como en CI                                        |

## Pruebas

- **Dominio y casos de uso:** permisos, transiciones de pausa y validaciones.
- **Infraestructura:** cliente HTTP (envelope, token, traducción de errores, red, cancelación y formato inválido) y adaptadores.
- **Aplicación completa:** se monta con dobles de los puertos y un router en memoria, y se prueban los flujos de sesión, listado, detalle y pausa.
- **Entorno:** jsdom no trae la API Fetch que usa React Router; `test/jsdom-environment.cjs` toma la de Node, salvo `FormData`, que sigue siendo el de jsdom.

## Seguridad

- **Token del personal solo en memoria:** nunca en LocalStorage. Recargar la página pide iniciar sesión de nuevo.
- **Logout:** limpia la caché de TanStack Query, para que nada de lo que vio una persona quede para la siguiente.
- **Datos personales:** llegan ya enmascarados del backend; revelar el dato completo será otra acción auditada.
- **Hosting (pendiente):** CSP estricta, `X-Frame-Options: DENY`, fallback de rutas a `index.html` y acceso por red interna o VPN (BO8).

## CI

El job `backoffice` de [.github/workflows/ci.yml](../../.github/workflows/ci.yml) corre `npm ci`, `npm run validate` y el control de vulnerabilidades altas o críticas del monorepo (`scripts/check-audit.mjs`).

## Limitaciones conocidas

- **Sin proveedor de identidad real:** el acceso de desarrollo deja elegir roles y solo existe con `STAFF_AUTH_PROVIDER=dev`, que el backend prohíbe en producción. El modo `oidc` (Cognito con MFA, PKCE y token en memoria) depende de BO2.
- **Sin despliegue:** el pipeline de despliegue del front y de la API todavía no existe.
