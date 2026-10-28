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

Sin backend, el login funciona con la API de autenticación falsa (`EXPO_PUBLIC_AUTH_API=fake`, solo en `dev`):

1. Bienvenida → **Continuar**.
2. Ingresa cualquier email válido o un teléfono con código de país (`+51…`).
3. En Verify OTP escribe **`1234`**.

Otro código descuenta intentos; el reenvío se habilita a los 30 s.

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
- **Sin capas vacías:** el `FetchHttpClient` se compone en el contenedor junto con `AuthApiRepository` (COPAYNI-19) y la renovación de sesión ante 401 (COPAYNI-21).

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

**Selector de idioma (COPAYNI-50):** Perfil → Idioma abre `LanguageSheet`, que lista `LANGUAGE_CATALOG` con `nativeName`.

- "Guardar" se habilita solo si cambia la selección; si cambia la dirección de lectura, avisa que el diseño se actualiza al reiniciar.
- Al guardar, `useLanguage` aplica el idioma y, sin esperar, lo envía al perfil (`SyncLanguagePreferenceUseCase` → `PATCH /v1/me` con `preferredLanguage`).
- Si el envío falla, el idioma local se mantiene y queda pendiente en AsyncStorage (`pref.language.syncPending`). Se reintenta al entrar a la zona privada en el siguiente arranque.
- `PATCH /v1/me` ya existe en el backend; la API falsa sigue disponible con `EXPO_PUBLIC_PROFILE_API=fake` (solo `dev`).
- Los métodos de cobro (paso 4, COPAYNI-37) usan `GET/PUT /v1/me/payout-method` ([docs/api/payouts.md](../../docs/api/payouts.md)); la API falsa se elige con `EXPO_PUBLIC_PAYOUTS_API=fake` (solo `dev`).
- El diseño del sheet (Figma 55:10285) no se pudo leer por el límite de la integración de Figma: usa `BottomSheet`, `RadioCard` y `Button` del design system y queda pendiente de validar con UX.

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
  - Superposiciones y dominio visual: `BottomSheet`, `Stepper`, `CircleCard` (recibe montos y fechas ya formateados con `formatMoney` / `formatDate`).
- Son de presentación pura: reciben datos, textos y eventos por props; no llaman casos de uso ni validan reglas de negocio (la validación vive en los value objects del dominio).
- Accesibilidad: roles y estados (`button`, `tab`, `switch`, `link`, `radio`, `radiogroup`, `alert`), áreas táctiles ≥ 48, ilustraciones ocultas a lectores de pantalla y tamaño de texto del sistema. Los errores de campo se anuncian como alerta.
- `OTPInput` usa un único `TextInput` oculto y las casillas son solo visuales: así funcionan pegar el código y el autocompletado desde SMS o email (`oneTimeCode` / `sms-otp`).
- `BottomSheet` es modal: el lector de pantalla solo alcanza su contenido; se cierra con la X, tocando el fondo o con el botón atrás de Android. Sin animación si el sistema pide reducir movimiento (`useReducedMotion`).
- **Catálogo visual** (`presentation/dev`): en el ambiente `dev`, Perfil → "Catálogo de componentes (dev)" muestra todos los componentes para revisarlos con UX. La ruta `/catalog` está protegida con `Stack.Protected` y no existe en staging ni en prod. Sus textos de ejemplo no van en los JSON de idioma.

## Autenticación (COPAYNI-18, 19, 20, 21)

```
SignInScreen    → useStartAuthentication → StartAuthenticationUseCase → AuthApiPort
VerifyOtpScreen → useVerifyOtp           → VerifyOtpUseCase           → AuthApiPort + TokenStoragePort
                → useResendOtp           → ResendOtpUseCase           → AuthApiPort
```

**Arranque y bienvenida**

- El splash nativo (`expo-splash-screen`) se mantiene hasta que el idioma, las fuentes y la sesión están resueltos: nunca se ve una pantalla en blanco.
- Con sesión, la app va directo a Home; sin sesión, a la bienvenida.

**Validación y contrato**

- `LoginIdentifier` (email normalizado o teléfono E.164) y `OtpCode` (4 dígitos) validan en el dominio.
- La pantalla reutiliza esa misma regla para validar en vivo. Un formato inválido nunca llega a la red.
- Contrato de API en [docs/api/auth.md](../../docs/api/auth.md): `AuthApiRepository` lo implementa sobre el backend y `InMemoryAuthApi` lo imita en `dev`.
  - La API falsa se elige con `EXPO_PUBLIC_AUTH_API=fake`.
  - La configuración la rechaza fuera de `dev`.

**Sesión y Remember Me**

- Remember Me marcado (por defecto): los tokens se guardan en SecureStore.
- Remember Me desmarcado: los tokens quedan solo en memoria y la sesión termina al cerrar la app.

**Errores**

- Errores del OTP tipados: `OtpVerificationError` con los motivos `invalid`, `expired` y `attempts_exceeded`.
  - Un código rechazado se borra.
  - Ante un fallo de red se conserva y se ofrece reintentar.
- Rate limit: el cliente HTTP lee `Retry-After` y la app muestra cuántos segundos esperar.
- El contador de reenvío se calcula desde `resendAvailableAt` del backend, no desde ticks locales.

**Navegación y enlaces**

- Los parámetros de ruta de Verify OTP solo llevan datos no sensibles: id del desafío y destino enmascarado.
- Si la ruta se abre sin ellos, la app vuelve al ingreso.
- Los enlaces de Términos y Privacidad se configuran con `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` (solo https). Sin URL se muestran como texto.

**Renovación de sesión sin bucles (COPAYNI-21)**

```
Petición → 401 → ¿endpoint de auth (skipSessionRefresh)? ─ sí → error, sin renovar
                     │ no
                     ▼
          RefreshSessionUseCase (una sola renovación en vuelo)
             ├─ tokens nuevos → la petición se reintenta UNA vez
             │                    └─ 401 otra vez → expire() → sessionExpired
             ├─ /auth/refresh rechazado → expire() → sessionExpired (sin reintentar)
             └─ fallo de red → se propaga; la sesión sigue abierta
```

- `expire()` borra los tokens y avisa por `SessionEvents`. El `SessionProvider` pasa a `sessionExpired` y limpia la caché de TanStack Query.
- La bienvenida muestra "Tu sesión expiró. Vuelve a ingresar.".
- La renovación conserva la elección de Remember Me: `save` sin `persist` mantiene el modo actual.
- **Cerrar sesión** borra la sesión local de inmediato. La revocación del refresh token (`/auth/logout`) va en segundo plano y no bloquea si no hay red.

## Unirse a un círculo (COPAYNI-27, 28, 29, 30)

```
JoinScreen / PayoutAmountScreen → useJoinConfig → GetJoinConfigUseCase → JoinConfigRepositoryPort
MonthlyPayInScreen → useInstallmentOptions → ListInstallmentOptionsUseCase → CircleQuoteRepositoryPort
SlotScreen → useAvailableSlots / useConfirmSlot
           → ListAvailableSlotsUseCase / ConfirmSlotSelectionUseCase → CircleQuoteRepositoryPort
                                → JoinFlowProvider (JoinCircleDraft en memoria)
```

- Botón central "+" → **Elige un servicio** (`/join`) → Game'ya (`/join/payout-amount`) o programa de ahorro (`/join/saving-program`, COPAYNI-32).
- Los montos máximos y el rango del slider llegan de `GET /circles/join-config` ([docs/api/circles.md](../../docs/api/circles.md)). Mientras no cargan, las opciones se muestran sin monto.
  - La API falsa se elige con `EXPO_PUBLIC_CIRCLES_API=fake` (solo `dev`).
- `PayoutRange` (dominio) ajusta cualquier monto al salto y lo limita al máximo del usuario (`capTo`).
- `JoinCircleDraft` es inmutable y vive en `JoinFlowProvider` (nunca en disco). "Unirme a un Game'ya" empieza un borrador limpio; "Join now" de Home podrá empezarlo con un monto (`start(amount)`).
- `Slider` del design system: se arrastra o se toca la pista; con lector de pantalla es `adjustable` y sube o baja de a un salto, anunciando el monto formateado.
- **Cuota mensual** (`/join/monthly-pay-in`, paso 2): las combinaciones cuota × meses llegan de `GET /circles/installment-options`; la app no las calcula.
  - Resumen del monto con "Editar", que vuelve al paso 1 conservando el monto.
  - Una cuota con `withinMonthlyLimit: false` aparece deshabilitada con el motivo. El campo es una propuesta para R5: si el backend no lo envía, ninguna cuota se restringe.
  - Cambiar el monto en el paso 1 descarta la cuota elegida; volver desde el paso 3 la conserva.
  - El diseño (Figma 55:9334) no se pudo leer por el límite de la integración de Figma: se armó con el inventario de `docs/product-context.md` y queda pendiente de validar con UX.
- **Turno de cobro** (`/join/slot`, paso 3): los slots llegan de `GET /circles/slots`, una propuesta que el backend todavía no implementa ([docs/api/circles.md](../../docs/api/circles.md)).
  - Resumen editable del monto y de la cuota; pestañas por tipo (Cobro más rápido, Menos fees, Mayor retorno) con el rango de meses y la etiqueta del tipo seleccionado.
  - Cada mes muestra su posición y el fee o el descuento. Los slots ocupados aparecen deshabilitados.
  - El botón dice "Continuar con <mes>". Antes de avanzar, `ConfirmSlotSelectionUseCase` revalida el slot; si se ocupó, avisa, invalida la query y quita la selección.
  - Cambiar la cuota o el monto descarta el turno elegido.
  - El paso 4 (`/join/payout-method`) es un placeholder hasta COPAYNI-37 y COPAYNI-31.
  - "Learn More" del aviso de Admin Fees no tiene destino diseñado y no se muestra (igual que en el paso 1, pending-scope D16). El diseño (Figma 55:9377 y 55:9444) tampoco se pudo leer; se armó con el inventario y queda pendiente de validar con UX.

## Pendientes conocidos

- Cierre del `BottomSheet` deslizando hacia abajo: requiere `react-native-gesture-handler` + Reanimated; se evaluará cuando una historia lo necesite.
- Validación visual del catálogo con UX en dispositivo (COPAYNI-14).
- Selector de país del `PhoneInput`: sin diseño; hoy el prefijo es fijo o abre un callback.
- Backend de autenticación (`/auth/start`, `/auth/verify`, `/auth/resend`): las historias COPAYNI-19/20 se cierran con la integración real.
- Backend de `/auth/refresh` (rotación con detección de reutilización) y `/auth/logout`: COPAYNI-21 se cierra con la integración real y la prueba de expiración en dispositivo.
- Marca final (logo, icono y splash nativo) y selector de país del teléfono: pending-scope D15 y D14.
- Política de OTP (duración, intentos, reenvíos): pending-scope R10.
- Backend de `/circles/join-config`; rangos y salto definitivos (M6, R15); carrusel y "Learn More" del paso 1 (D16).
- Crash reporting y telemetría mobile: decisión técnica pendiente (pending-scope T8).
- React Hook Form: los formularios de auth tienen un solo campo y no lo necesitan; se evaluará con el primer formulario de varios campos (KYC). Hoy `@hookform/resolvers` tiene un conflicto de dependencias opcionales.
