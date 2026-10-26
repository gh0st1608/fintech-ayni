# Ayni — App mobile

App React Native + Expo de la cooperativa Ayni (ahorro colaborativo / Game'ya). Sigue la _Base Técnica Enterprise Senior Frontend Mobile_ (arquitectura hexagonal).
Backlog: Jira **COPAYNI** (épica COPAYNI-1, Fundaciones técnicas).

## Requisitos

- **Node.js ≥ 22.13**, exigido por Expo SDK 58. Está fijado en `.nvmrc` (`nvm use`) y en `engines` de `package.json`.
- npm (el lockfile es `package-lock.json`).
- Expo Go o un development build para ejecutar en dispositivo.

## Inicio rápido

```bash
cd apps/mobile
npm ci
cp .env.example .env.local   # ajustar EXPO_PUBLIC_API_URL
npm start
```

En el ambiente `dev`, la pantalla de bienvenida ofrece **"Entrar en modo demo"** para recorrer el shell sin backend. Se retira cuando exista el login con OTP (COPAYNI-19/20).

## Scripts

| Script                                      | Uso                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `npm start` / `android` / `ios` / `web`     | Servidor de desarrollo de Expo                                      |
| `npm run lint` / `lint:fix`                 | ESLint (config Expo + Prettier + reglas de i18n y moneda)           |
| `npm run format` / `format:check`           | Prettier                                                            |
| `npm run typecheck`                         | `tsc --noEmit` (TypeScript strict)                                  |
| `npm test` / `test:watch` / `test:coverage` | Jest + React Native Testing Library                                 |
| `npm run doctor`                            | `expo-doctor`                                                       |
| `npm run validate`                          | lint + typecheck + format:check + test:coverage (lo que ejecuta CI) |

## Arquitectura hexagonal

Capas organizadas por módulo de negocio (`auth`, `i18n`, `shared`…). Las capas internas no dependen de las externas: los puertos viven en `domain` y los adaptadores de `infrastructure` los implementan.

```
src/
  domain/                         # Reglas puras: sin React Native, Expo, HTTP ni almacenamiento
    shared/value-objects/Money.ts #   Dinero en unidades menores + ISO 4217
    shared/errors/                #   DomainError (invariantes) y AppError (clasificación de fallos)
    shared/ports/HttpClientPort   #   Contrato HTTP (los fallos son AppError)
    auth/                         #   AuthTokens, SessionStatus, TokenStoragePort
    i18n/                         #   SupportedLanguage + LanguagePreference/DeviceLocale/LayoutDirection ports
  application/                    # Casos de uso: coordinan puertos, se prueban en Jest sin UI
    auth/usecases/                #   RestoreSession, SignIn, SignOut
    i18n/usecases/                #   ResolveLanguage, ChangeLanguage
    AppContainer.ts               #   Contrato de lo que la UI puede usar
  infrastructure/                 # Adaptadores, nombrados por tecnología
    http/FetchHttpClient.ts       #   fetch: timeout, cancelación, correlación, errores normalizados
    storage/                      #   SecureStoreTokenStorage, AsyncStorageLanguagePreference
    device/                       #   ExpoDeviceLocale, ReactNativeLayoutDirection
  presentation/                   # Pantallas, componentes, hooks y providers
    providers/                    #   AppProviders, ContainerProvider (DI), SessionProvider
    <módulo>/screens/             #   Pantallas por módulo (auth, home, circles, join, payment, profile)
    navigation/                   #   Configuración de pestañas y cabeceras (sin URLs)
    shared/components/            #   Design system
    i18n/ formatters/ query/ theme/
  bootstrap/
    env.ts                        # Variables EXPO_PUBLIC_* validadas con Zod (falla rápido)
    container.ts                  # Raíz de composición: único lugar que instancia adaptadores
  app/                            # Adaptador de navegación (Expo Router): re-exporta pantallas
test/
  fakes/                          # Puertos en memoria + createTestContainer
  navigation.test.tsx             # Integración con las rutas reales
```

**Flujo de datos:** Screen → hook / provider → caso de uso (inyectado por `ContainerProvider`) → puerto → adaptador → backend o capacidad del sistema operativo.

**Límites protegidos por lint** (`no-restricted-imports` en `eslint.config.js`):

| Capa             | No puede importar                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `domain`         | otras capas, React/React Native/Expo, AsyncStorage, TanStack, i18next, Zod                                                     |
| `application`    | infrastructure, presentation, bootstrap, frameworks                                                                            |
| `infrastructure` | application, presentation, bootstrap                                                                                           |
| `presentation`   | infrastructure, bootstrap, SecureStore, AsyncStorage, expo-localization                                                        |
| `app` (rutas)    | todo excepto `expo-router`, `presentation/<módulo>/screens` y `presentation/providers`                                         |
| `app` (layouts)  | domain, application, infrastructure, UI (`react-native`, i18n, theme, componentes). Solo el `_layout.tsx` raíz usa `bootstrap` |

**`app/` frente a `presentation/`:** `app/` es parte de la capa de presentación, pero se mantiene aparte porque Expo Router convierte cada archivo de `src/app` en una ruta. Contiene solo layouts, guards y re-exports como `export { HomeScreen as default } from '@/presentation/home/screens/HomeScreen'`. Las URLs se deciden en `app/`; por ejemplo, `useMainTabs({ onJoinPress })` recibe la navegación desde el layout. Cambiar de router solo afectaría a `app/`.

Convenciones: casos de uso `VerbObjectUseCase`, puertos `ConceptoPort`, adaptadores `<Tecnología><Concepto>`, componentes en PascalCase y hooks `useXxx`.

Decisiones:

- **Inyección por contexto, no singleton:** `createContainer(env)` se instancia una vez en `app/_layout.tsx` y se entrega por `ContainerProvider`. Las pruebas inyectan `createTestContainer()` con adaptadores en memoria.
- **El puerto HTTP no depende de Zod:** recibe `parse?: (data) => T`, y los repositorios pasan `schema.parse`.
- **Sin capas vacías:** el `FetchHttpClient` se compone en el contenedor con el primer repositorio (COPAYNI-19). La notificación de 401 → `sessionExpired` se conecta en COPAYNI-21; el caso de uso `SignOutUseCase('expired')` ya existe.

## Internacionalización: un JSON por idioma (COPAYNI-16)

- Textos en `src/presentation/i18n/locales/<código>.json`, registrados en `LANGUAGE_CATALOG` (`languages.ts`).
- Resolución del idioma (`ResolveLanguageUseCase`): preferencia guardada → idioma del dispositivo soportado → `EXPO_PUBLIC_DEFAULT_LANGUAGE` → primer idioma del catálogo.
- Cambio en caliente con `useLanguage().changeLanguage(code)`: persiste la preferencia y, si cambia LTR↔RTL, lo indica con `requiresRestart`.
- Las claves están tipadas: `t('clave.inexistente')` no compila.
- **Prohibido el texto literal en JSX** (`i18next/no-literal-string`, también en `title`, `label`, `placeholder` y `accessibilityLabel`).
- Un test exige que todos los JSON tengan las mismas claves y variables de interpolación, sin textos vacíos ni monedas.

**Agregar un idioma:**

1. Copiar `locales/es.json` a `locales/<código>.json` y traducirlo.
2. Registrarlo en `LANGUAGE_CATALOG` (`languages.ts`) con `nativeName` y `direction` (`ltr`/`rtl`).
3. Añadir el código a `supportedLocales` del plugin `expo-localization` en `app.json`.

El cambio LTR↔RTL requiere reiniciar la app y no funciona en Expo Go.

## Moneda configurable (COPAYNI-17)

- Los montos son el value object `Money` (`domain/shared/value-objects`): `amount` es un entero en unidades menores y `currency` un código ISO 4217, igual que en el backend. Es inmutable y `add` rechaza monedas distintas.
- Se formatean **solo** con `formatMoney` / `useFormatMoney` (`presentation/formatters`), que usan Intl con el idioma activo.
- La moneda por defecto es `EXPO_PUBLIC_DEFAULT_CURRENCY` (propuesta: `PEN`, pendiente de confirmación en `docs/pending-scope.md` M1). La moneda real de cada monto llega del backend.
- Lint bloquea literales como `MAD`, `PEN`, `USD`, `S/` o `$` en `src/` (salvo en `bootstrap/`).

## Seguridad

- Los tokens se guardan solo en `expo-secure-store`; AsyncStorage solo guarda preferencias no sensibles.
- `EXPO_PUBLIC_*` es público: nunca poner secretos en `.env`.
- El cliente HTTP no reintenta por su cuenta. TanStack Query reintenta solo los errores transitorios de las lecturas; las mutaciones nunca se reintentan solas.
- Las operaciones no idempotentes envían un `Idempotency-Key`.

## Pruebas

| Nivel        | Qué se prueba                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dominio      | `Money`, `AuthTokens`, `AppError`: invariantes y errores                                                                           |
| Aplicación   | Casos de uso con puertos en memoria (`test/fakes/ports.ts`)                                                                        |
| Adaptadores  | `FetchHttpClient` (timeout, cancelación, contrato `{success,data,error,traceId}`, `parse`), SecureStore, AsyncStorage, dispositivo |
| Bootstrap    | Validación de env y cableado del contenedor                                                                                        |
| Presentación | Providers (sesión, contenedor, idioma), formatters, i18n (paridad de JSON), `Button`                                               |
| Integración  | `test/navigation.test.tsx` con las rutas reales: guard, tabs, botón central, login/logout sin loops                                |

- Los mocks globales de módulos nativos están en `test/setup.tsx`.
- RNTL 14: `render`, `renderHook` y `fireEvent` son asíncronos (usar `await`).

## Design system (COPAYNI-14)

- Tokens del Figma en `presentation/theme/tokens.ts`: colores (incluidos éxito y error), espaciados, radios, tipografía, elevación y alto de botón.
- Tipografía **Outfit** (`presentation/theme/fonts.ts`): se cargan solo los pesos Light, Regular y SemiBold; si falla la carga, la app usa la fuente del sistema.
- Componentes en `presentation/shared/components`:
  - Base: `AppText`, `Button`, `Screen`, `Card`, `ListItem`, `Toggle`, `SegmentedTabs`, `Badge`, `EmptyState`, `InfoBanner`, `Chevron` (se invierte en RTL), `JoinTabButton`, `ComingSoon`.
  - Formularios: `TextField`, `PhoneInput` (bandera calculada del código de región), `OTPInput`, `RadioCard` + `RadioGroup`, `FieldError`.
- Son de presentación pura: reciben datos, textos y eventos por props; no llaman casos de uso ni validan reglas de negocio (la validación vive en los value objects del dominio).
- Accesibilidad: roles y estados (`button`, `tab`, `switch`, `link`, `radio`, `radiogroup`, `alert`), áreas táctiles ≥ 48, ilustraciones ocultas a lectores de pantalla y tamaño de texto del sistema. Los errores de campo se anuncian como alerta.
- `OTPInput` usa un único `TextInput` oculto y las casillas son solo visuales: así funcionan pegar el código y el autocompletado desde SMS o email (`oneTimeCode` / `sms-otp`).

## Pendientes conocidos

- Design system, etapa 3: BottomSheet, Stepper, CircleCard y catálogo visual (COPAYNI-14).
- Selector de país del `PhoneInput`: sin diseño; hoy el prefijo es fijo o abre un callback.
- Splash y onboarding definitivos: COPAYNI-18.
- Login con OTP (COPAYNI-19/20). Refresh de tokens y conexión 401 → `sessionExpired` (COPAYNI-21).
- Crash reporting y telemetría mobile: decisión técnica pendiente (pending-scope T8).
- React Hook Form + Zod se instalarán con la primera historia que tenga formulario (COPAYNI-19). Hoy `@hookform/resolvers` tiene un conflicto de dependencias opcionales.
