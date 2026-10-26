# Backlog propuesto — COPAYNI (coperativa-ayni)

Estado: **APROBADO y CREADO en Jira** el 2026-10-25 (ver sección E.1). Descripciones del frontend revisadas el 2026-10-26 según la *Base Técnica Enterprise Senior Frontend Mobile* (ver sección E.2).
Fuentes: [product-context.md](product-context.md) (inventario de Figma), guías *Backend Enterprise NestJS* y *Base Técnica Enterprise Senior Frontend Mobile* (PDF; sustituye a la *Base Técnica Enterprise Frontend React Native*), README (`Nestjs-React-HCL-AWS`).

## A. Resumen ejecutivo

- **Producto:** app mobile de ahorro colaborativo (ROSCA / Game'ya) con programas de ahorro con cashback, KYC documental, métodos de cobro y referidos.
- **Módulos:** Onboarding/Auth · Home y Círculos · Unión a Game'ya · Programa de ahorro · Pagos y cobros · Perfil/KYC · Referidos, más fundaciones técnicas.
- **Alcance analizado:** 37 pantallas, User Flow y diagrama ROSCA (100% de la página Screens).
- **Riesgos principales:**
  1. **El flujo de pago de la cuota mensual (pay-in) no está diseñado.** Es el núcleo financiero del producto.
  2. Faltan las reglas de cálculo de fees, descuentos y orden de turnos, y la del límite de pay-in.
  3. Pasarela de pago, proveedor KYC/OCR y regulador sin definir.
  4. El diseño está localizado para Marruecos/Egipto (MAD, Fawry, árabe); hay que adaptarlo al contexto de Ayni.
  5. Falta un back-office para operar círculos y validar documentos.

### Stack aplicado (de los PDF)

| Capa | Decisión base |
|---|---|
| Backend | NestJS + TypeScript strict, hexagonal por módulos (`domain/application/infrastructure/presentation`), DI con tokens, ValidationPipe global + DTOs, Exception Filter con contrato `{success,data|error,traceId}`, `@nestjs/config` validado, Jest con cobertura > 90%, OpenTelemetry → New Relic, Helmet/CORS/rate limiting |
| Mobile | React Native + Expo SDK 58 + TypeScript strict, **arquitectura hexagonal** (`domain` / `application` / `infrastructure` / `presentation` / `bootstrap` + `app` de Expo Router), puertos y adaptadores, contenedor inyectado por contexto, TanStack Query, Zod para datos externos, SecureStore, Jest + RNTL con pruebas por nivel, límites entre capas protegidos por lint. React Hook Form opcional (solo en formularios complejos) |
| Calidad / CI | ESLint, Prettier, Husky, lint-staged, commitlint (Conventional Commits), GitHub Actions; despliegue AWS por OIDC |
| Infra | AWS (Lambda/API Gateway **o** contenedores: decisión en spike) con Terraform (HCL, según el README) |

Base de datos, pasarela de pago y proveedor KYC: **por definir** (se tratan como spikes).

## B. Convenciones en Jira (verificadas en COPAYNI)

- Tipos: **Epic**, **Historia**, **Tarea**, Subtask. Proyecto team-managed, vacío, sin duplicados posibles.
- Campos que se escribirán: `summary`, `description`, `parent` (épica), `labels` y **Story point estimate** (`customfield_10016`).
- El proyecto **no tiene campo Prioridad ni Componentes**. La prioridad MoSCoW va como etiqueta: `must`, `should`, `could`.
- Etiquetas de área: `backend`, `mobile`, `fullstack`, `infra`, `spike`, `pendiente-diseno`.
- Dependencias: enlace **Blocks** (y **Relates** cuando no hay bloqueo real).
- **Sin subtareas:** cada issue lleva en su descripción un checklist de Backend/Mobile/QA. Se pueden generar subtareas más adelante en las historias que el equipo quiera repartir.
- Escala de story points: Fibonacci (1, 2, 3, 5, 8, 13). Confianza indicada por épica.

## C. Backlog propuesto

### E1 · Fundaciones técnicas de plataforma — 50 SP · confianza media

Objetivo: base backend y mobile lista para producción según las guías enterprise, para que las funcionalidades se construyan sobre contratos, calidad y observabilidad comunes.

| ID | Tipo | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|---|
| T1.1 | Tarea | Inicializar backend NestJS con arquitectura hexagonal y contratos base | 5 | must | backend | — |
| T1.2 | Tarea | Configurar calidad de código y pipelines CI de GitHub Actions (backend y mobile) | 5 | must | infra | T1.1, T1.6 |
| T1.3 | Tarea | Implementar observabilidad del backend (OpenTelemetry, New Relic, health checks) | 5 | must | backend | T1.1 |
| T1.4 | Tarea | Spike: definir despliegue AWS, base de datos y estrategia IaC con Terraform | 3 | must | infra, spike | — |
| T1.5 | Tarea | Provisionar infraestructura base en AWS con Terraform y despliegue por OIDC | 8 | must | infra | T1.4, T1.2 |
| T1.6 | Tarea | Inicializar app mobile Expo con TypeScript strict, Expo Router y TanStack Query | 5 | must | mobile | — |
| T1.7 | Tarea | Construir design system mobile a partir de los tokens y componentes de Figma | 8 | must | mobile | T1.6 |
| T1.8 | Tarea | Implementar shell de navegación (tabs y botón central Join) con rutas públicas y privadas | 3 | must | mobile | T1.7 |
| T1.9 | Tarea | Implementar internacionalización con archivos JSON por idioma | 5 | must | mobile | T1.6 |
| T1.10 | Tarea | Implementar manejo de moneda configurable (ISO 4217) y formato monetario por locale | 3 | must | fullstack | T1.1, T1.9 |

Criterios de finalización clave:
- **T1.1:** ValidationPipe global, Exception Filter con contrato uniforme, ConfigModule que falla rápido, `.env.example`, Swagger, Helmet/CORS/rate limit, módulo de ejemplo con puerto y adaptador más tests.
- **T1.3:** trazas con traceId en los logs; `/health/live` y `/health/ready` distintos; conectividad del exporter verificada.
- **T1.6:** capas hexagonales y raíz de composición (`bootstrap/container.ts`); `HttpClientPort` + `FetchHttpClient` con timeout, cancelación, normalización de errores y correlación; `TokenStoragePort` sobre SecureStore; scripts `lint`, `typecheck`, `test`, `test:coverage` y `validate`; Node ≥ 22.13 fijado.
- **T1.9 (i18n con JSON):** un archivo por idioma en `src/presentation/i18n/locales/<código>.json`, resuelto por `ResolveLanguageUseCase` y cambiado por `ChangeLanguageUseCase` (p. ej. `es.json`, `en.json`), con claves agrupadas por feature (`auth.otp.title`, `circles.join.cta`…). La app carga el idioma del dispositivo si existe su JSON y, si no, usa el idioma por defecto (`es`, pendiente de confirmar). Fallback por clave al idioma por defecto. Interpolación y plurales (`{{count}}`). Soporte RTL automático si el idioma es RTL. **Ningún texto de UI hardcodeado**: lint o test que detecte strings literales en JSX. Agregar un idioma = agregar un JSON y registrarlo, sin tocar pantallas. Test de paridad de claves entre todos los JSON.
- **T1.10 (moneda configurable):** ningún "MAD" ni símbolo hardcodeado. El backend modela `Money { amount (unidades menores, entero), currency (ISO 4217) }` y expone la moneda del círculo o plan en cada respuesta. La moneda por defecto viene de configuración validada (`DEFAULT_CURRENCY`, pendiente: PEN propuesto). La app modela el dinero con el value object `Money` del dominio y lo formatea con `Intl.NumberFormat(locale, { style: 'currency', currency })` a través de un único helper de presentación, `formatMoney`. Tests con al menos dos monedas y dos locales.
- **T1.7:** componentes Button, TextField, OTPInput, Card, CircleCard (timeline de turnos), InfoBanner, EmptyState, BottomSheet, SegmentedTabs, Stepper, RadioCard y ListItem, con accesibilidad y tests.

### E2 · Onboarding y autenticación — 23 SP · confianza media

Objetivo: el usuario accede de forma segura con email o teléfono más OTP y mantiene su sesión.
Referencias: 55:10698, 55:10702, 55:10706, 55:10710, 55:10724, 55:10749, 55:10201.

| ID | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|
| H2.1 | Ver splash y pantalla de bienvenida al abrir la app | 2 | must | mobile | T1.8 |
| H2.2 | Ingresar o registrarse con email o teléfono | 5 | must | fullstack | T1.1, T1.8 |
| H2.3 | Verificar identidad con código OTP de 4 dígitos | 5 | must | fullstack | H2.2 |
| H2.4 | Mantener la sesión iniciada y cerrar sesión de forma segura | 5 | must | fullstack | H2.3 |
| H2.5 | Habilitar inicio de sesión con biometría | 3 | could | mobile, pendiente-diseno | H2.4 |
| H2.6 | Cambiar el passcode de acceso | 3 | could | fullstack, pendiente-diseno | H2.4 |

- **H2.2** — *Como usuario nuevo o registrado, quiero ingresar mi email o teléfono, para recibir un código de acceso sin contraseña.*
  - Dado un email o teléfono con formato válido, cuando pulso Continue, entonces se envía un OTP y navego a Verify OTP.
  - Dado un valor con formato inválido, cuando pulso Continue, entonces veo un error asociado al campo y no se envía la solicitud.
  - Dado que el envío falla, entonces veo un mensaje accionable y puedo reintentar sin enviar dos veces.
  - Se muestran los enlaces Terms of Use y Privacy Policy.
  - Backend: endpoint para iniciar la autenticación (crea el usuario si no existe), rate limit por identificador e IP, OTP con hash y expiración.
  - Pendiente: login social (el texto lo menciona, pero no hay botones), proveedor de SMS/email, formato de teléfono y país.
- **H2.3** — *Como usuario, quiero introducir el OTP de 4 dígitos, para verificar que el email o teléfono me pertenece.*
  - Dado un OTP correcto y vigente, cuando completo los 4 dígitos, entonces se emite la sesión y navego a Home.
  - Dado un OTP incorrecto o expirado, entonces veo un error y los intentos quedan limitados.
  - Dado que el contador llega a 0, entonces se habilita Resend, y al pulsarlo se invalida el código anterior.
  - "Remember Me" marcado hace que la sesión persista entre aperturas; desmarcado, expira al cerrar la app.
  - Pendiente: duración del contador (el diseño muestra 02:39), número máximo de intentos y de reenvíos, comportamiento exacto de Remember Me.
- **H2.4** — Access y refresh token en SecureStore, restauración de sesión al arrancar, refresh transparente, logout que revoca el refresh token y limpia los datos sensibles.
- **H2.5 / H2.6** — Las opciones existen en el Perfil, pero **los flujos no están diseñados** (el User Flow dice "Change Password" y el Perfil dice "Change Passcode"). Hay que confirmar si existe passcode antes de construir.

### E3 · Círculos de ahorro (Game'ya) — 39 SP · confianza baja-media

Objetivo: el usuario descubre círculos, se une eligiendo monto, cuota y turno, y sigue sus círculos.
Referencias: 55:8637, 55:8853, 55:9572, 55:9688, 55:9069, 55:9091, 55:9334, 55:9377, 55:9444, 55:6887.

| ID | Tipo | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|---|
| T3.1 | Tarea | Modelar el dominio de círculos: miembros, turnos, cronograma, fees y descuentos | 8 | must | backend | T1.1 |
| H3.1 | Historia | Ver en Home ofertas, círculos recomendados y metas populares | 5 | must | fullstack | T1.8, T3.1 |
| H3.2 | Historia | Ver mis círculos activos y finalizados | 5 | must | fullstack | T3.1 |
| H3.3 | Historia | Elegir el servicio a contratar: Game'ya o programa de ahorro | 2 | must | mobile | T1.8 |
| H3.4 | Historia | Elegir el monto de payout del Game'ya | 3 | must | fullstack | H3.3 |
| H3.5 | Historia | Elegir la cuota mensual y la duración del Game'ya | 3 | must | fullstack | H3.4, T3.1 |
| H3.6 | Historia | Elegir el turno de cobro según rapidez, fees o retorno | 8 | must | fullstack | H3.5 |
| H3.7 | Historia | Confirmar la unión al Game'ya | 5 | must | fullstack, pendiente-diseno | H3.6, H6.4, H5.3 |

- **T3.1** — Entidades Circle, Membership, Slot y PaymentSchedule; value objects Money y Period; servicio de dominio para calcular cuota por slot (fees en los primeros, descuento en los últimos, Admin Fees repartidas hasta el mes de payout); asignación de slots con control de concurrencia (dos usuarios no pueden tomar el mismo slot); unión idempotente. Unit tests > 90%. **Bloqueado parcialmente por las reglas de negocio pendientes (Q1–Q4).**
- **H3.1** — *Como usuario, quiero ver ofertas, círculos recomendados y metas populares en Home, para descubrir cómo ahorrar.*
  - La tarjeta recomendada muestra monto total, cuota mensual, timeline con "Your Turn", fechas de inicio y fin, duración, Admin Fees y botón Join now (que abre el flujo de unión con el monto precargado).
  - El banner de invitación lleva a Refer a friend.
  - Estados de carga (skeleton), error con reintento y lista vacía.
  - Pendiente: origen de las ofertas y metas (¿CMS o back-office?), criterio de recomendación, significado del icono de fuego.
- **H3.2** — Tabs Active/Finished. Estado vacío "Your active circles will appear here!" con recomendados debajo. La tarjeta "Joined" muestra el turno del usuario. Pendiente: pantalla de detalle de un círculo y de un círculo finalizado (no diseñadas).
- **H3.4** — Slider de 3.000 a 120.000 MAD con paso por definir, monto visible en tiempo real, stepper en el paso 1/4, carrusel informativo "Learn More" y Next. El límite superior real depende del límite mensual del usuario (Q5).
- **H3.5** — Lista de combinaciones cuota × meses calculada por el backend para el monto elegido, resumen con Edit para volver al paso 1, aviso de que la cuota varía por slot.
- **H3.6** — *Como usuario, quiero elegir mi turno de cobro, para equilibrar la rapidez del payout frente a fees o descuentos.*
  - Dados los tres tipos (Fastest Payout / Lowest Fees / Highest Return), cuando elijo uno, entonces veo los meses disponibles con su posición, fees o descuento.
  - Dado un slot ocupado, entonces no aparece o aparece deshabilitado.
  - Dado que selecciono un mes, entonces el CTA muestra "Continue with <mes>".
  - Resumen editable de los pasos 1 y 2.
- **H3.7** — *Como usuario, quiero revisar y confirmar mi unión, para quedar inscrito en el círculo con mi turno.*
  - Dado que no tengo un National ID válido, cuando intento confirmar, entonces se me redirige a Scan National ID (regla del Central Bank).
  - Dado que la cuota supera mi límite mensual, entonces no puedo confirmar y veo cómo aumentar el límite.
  - Dada una confirmación exitosa, entonces el círculo aparece en Active y el slot queda reservado de forma atómica.
  - Pendiente: **pantalla de confirmación, firma de contrato y pagaré, y primer pago no diseñados**.

### E4 · Programa de ahorro con cashback — 8 SP · confianza baja

Objetivo: el usuario se suscribe a un plan de ahorro programado con cashback.
Referencias: 55:9164, 55:9220.

| ID | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|
| H4.1 | Ver los planes de ahorro disponibles y su cashback | 3 | should | fullstack | H3.3 |
| H4.2 | Elegir la duración del plan de ahorro y suscribirme | 5 | should | fullstack, pendiente-diseno | H4.1, T3.1 |

- **H4.1** — Lista de planes (nombre, monto objetivo, "Up to X extra") servida por el backend; estados de carga y error.
- **H4.2** — Bottom sheet con 6/12/24 meses, cuota mensual, Starts On, Payout Date y Total Payout calculados por el backend; Next. Pendiente: fórmula de cashback, qué ocurre después de Next (no diseñado), nombres de planes duplicados y fecha de payout incoherente.

### E5 · Pagos, cobros y métodos de pago — 34 SP · confianza media

Objetivo: el usuario gestiona su elegibilidad, cómo cobra, sus tarjetas y su historial.
Referencias: 55:9846, 55:9892, 55:10052, 55:10144, 55:10087, 55:10158, 55:9944, 55:9962, 55:10018, 55:9520.

| ID | Tipo | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|---|
| T5.1 | Tarea | Spike: seleccionar pasarela de pago y estrategia de tokenización PCI-DSS | 3 | must | backend, spike | — |
| H5.1 | Historia | Ver el resumen de pagos y accesos de la sección Payment | 3 | must | fullstack | T1.8 |
| H5.2 | Historia | Revisar mi elegibilidad para recibir el payout | 5 | must | fullstack | H6.3, H5.3 |
| H5.3 | Historia | Seleccionar el método de cobro del payout | 5 | must | fullstack | T1.1 |
| H5.4 | Historia | Activar la deducción automática del pay-in desde el payout | 2 | should | fullstack | H5.1 |
| H5.5 | Historia | Gestionar mis tarjetas guardadas | 5 | must | fullstack | H5.6 |
| H5.6 | Historia | Agregar una tarjeta de pago de forma segura | 8 | must | fullstack | T5.1 |
| H5.7 | Historia | Consultar el historial de pagos y cobros | 3 | should | fullstack | T3.1 |

- **H5.2** — Checklist de National ID, Insurance Note, Payout Method, Contract y Due Payments, cada uno con su estado (✔ o ⚠) y navegación a la acción que lo corrige. Pendiente: firma del Insurance Note y del Contract (sin diseño ni proveedor de firma).
- **H5.3** — Opciones Digital Wallets, Prepaid Card (límite 100.000 MAD, sin cargo), Bank Transfer (sin cargo) y Fawry deshabilitado ("Not available"). Solo se puede cambiar antes del mes de payout. Pendiente: pantalla "Add Account" para los datos de la cuenta o wallet (no diseñada); proveedores locales.
- **H5.6** — *Como usuario, quiero agregar una tarjeta, para pagar mis cuotas.*
  - La tarjeta se tokeniza en el SDK de la pasarela; el backend **nunca** recibe ni guarda PAN ni CVC.
  - Validación de Luhn, fecha futura y CVC de 3–4 dígitos; marca detectada (Visa/MC/UnionPay).
  - Doble envío prevenido; error de la pasarela mostrado de forma accionable.
  - Los logs no contienen datos de tarjeta.
- **H5.5** — Lista enmascarada (****0215), predeterminada por radio, editar (¿alias o expiración?) y eliminar con confirmación; estado vacío.
- **H5.7** — Tabs Payments/Payouts paginadas: monto, fecha y hora, mes; estado vacío con "Explore Circles". Pendiente: detalle de una transacción (el chevron no tiene destino diseñado).

### E6 · Perfil, documentos y verificación (KYC) — 40 SP · confianza baja-media

Objetivo: el usuario gestiona sus datos y sube los documentos que verifican su identidad y determinan su límite.
Referencias: 55:10201, 55:10379, 55:10523, 55:10598, 55:10630, 55:10662, 55:10677, 55:10285.

| ID | Tipo | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|---|
| T6.1 | Tarea | Spike: seleccionar proveedor de verificación de identidad y OCR | 3 | must | backend, spike | — |
| T6.2 | Tarea | Implementar almacenamiento seguro de documentos (S3 cifrado, URLs prefirmadas, retención) | 5 | must | backend, infra | T1.1, T1.5 |
| H6.1 | Historia | Ver mi perfil y mi límite mensual de pay-in | 3 | must | fullstack | H2.4 |
| H6.2 | Historia | Consultar y editar mi información personal | 3 | should | fullstack | H6.1 |
| H6.3 | Historia | Ver mis documentos y su estado de verificación | 3 | must | fullstack | T6.2 |
| H6.4 | Historia | Escanear ambas caras de mi documento nacional de identidad | 8 | must | fullstack | T6.1, T6.2 |
| H6.5 | Historia | Declarar mi ingreso mensual y subir un comprobante de ingresos | 8 | must | fullstack | T6.2 |
| H6.6 | Historia | Subir documentos adicionales (recibo de servicios, licencia, carnés) | 5 | could | fullstack, pendiente-diseno | T6.2 |
| H6.7 | Historia | Cambiar el idioma de la app | 2 | should | mobile | T1.9 |

- **H6.4** — Guía con ejemplos "Don't", captura con cámara (permiso con propósito explícito) del anverso y el reverso, subida, estado "en verificación" y resultado. Pendiente: verificación automática o manual, y qué datos se extraen.
- **H6.5** — Elegir HR Letter o Bank Statement (3 meses), ingresar el ingreso mensual (Next deshabilitado con 0), escanear el documento con la guía. El límite de pay-in se recalcula tras la aprobación. **Pendiente: fórmula del límite (Q5).**
- **H6.2** — Nombre, apellido, código de país + teléfono, email. Pendiente: si cambiar teléfono o email exige re-verificar por OTP.
- **H6.7** — Bottom sheet que lista **los idiomas disponibles según los JSON registrados** (el diseño muestra English/Arabic); Save habilitado solo si hay cambio; aplica el idioma (y RTL si corresponde) sin reiniciar y persiste la preferencia en el dispositivo y en el perfil. Pendiente: idiomas definitivos para Ayni.

### E7 · Referidos e invitaciones — 11 SP · confianza media

Objetivo: el usuario invita a amigos y ambos obtienen un descuento.
Referencias: 55:10419, 55:10456.

| ID | Título | SP | Prioridad | Etiquetas | Depende de |
|---|---|---|---|---|---|
| H7.1 | Compartir mi código y enlace de invitación | 3 | could | fullstack | H6.1 |
| H7.2 | Seguir mis invitaciones y mi saldo de referidos | 3 | could | fullstack | H7.1 |
| H7.3 | Recibir el descuento de referido en mi siguiente pay-in | 5 | could | backend | H7.1, T3.1 |

- **H7.1** — Código único copiable, share sheet nativo con enlace (deep link validado), explicación de los 3 pasos.
- **H7.3** — El invitado recibe 150 de descuento en su primer pay-in al registrarse con el código y unirse a su primer Game'ya. El invitador recibe 150 en su siguiente pay-in cuando el invitado liquida el primero. Earned/Redeemed/Balance auditables. Depende del pay-in (no diseñado). Moneda pendiente (USD o MAD).

### Pendiente de diseño (NO se crean issues hasta que haya diseño o decisión; detalle en [pending-scope.md](pending-scope.md))

1. **Pago de la cuota mensual (pay-in):** pantalla de cuotas pendientes, pago con tarjeta, recibos.
2. Confirmación de unión al Game'ya, firma del contrato y del pagaré de seguro.
3. "Add Account" (datos bancarios o wallet para el payout).
4. Notificaciones (la campana aparece en todas las pantallas).
5. Payment Policy, Help / Get Help.
6. Detalle de círculo, de círculo finalizado y de transacción.
7. Back-office de administración (círculos, KYC, pagos).

## D. Preguntas abiertas de negocio

- Q1. ¿Cómo se calculan los fees de los primeros slots y los descuentos de los últimos?
- Q2. ¿Cómo se forman los círculos: los crea un admin, se llenan automáticamente? ¿Cuántos miembros tienen?
- Q3. ¿Qué pasa si un miembro no paga (mora, seguro, pagaré)?
- Q4. ¿Las Admin Fees se suman al monto o se descuentan de él? (inconsistencia 24.000 frente a 2.880)
- Q5. ¿Cuál es la fórmula del límite mensual de pay-in según ingresos y documentos?
- Q6. Moneda, idiomas, regulador y proveedores (wallets, banco, red de pagos) para Ayni.
- Q7. Fórmula del cashback del ahorro (¿20% o 5%?) y nombres de los planes.
- Q8. ¿Existe passcode? ¿Habrá login social?
- Q9. ¿Hay presupuesto o plazo para un back-office?

## E. Plan de ejecución en Jira (cuando se apruebe)

1. Crear las **7 épicas** y verificar sus claves.
2. Crear las **10 tareas de E1** con `parent` = E1.
3. Crear historias y tareas de E2 → E7 (**36 issues**) con `parent`, etiquetas y story points.
4. Crear los enlaces **Blocks** según la columna "Depende de" (~45 enlaces).
5. Releer todo con JQL (`project = COPAYNI`) y verificar tipo, padre, SP, etiquetas y enlaces.
6. Actualizar este documento con las claves reales.

**Total: 53 issues nuevos (7 épicas, 14 tareas, 32 historias); 0 modificados; 0 duplicados detectados.**
El alcance pendiente para completar el producto está en [pending-scope.md](pending-scope.md).
No se asignan personas, sprints ni fechas.

## E.1 Resultado en Jira (ejecutado y verificado el 2026-10-25)

Sitio: https://uni-team-o65it7c7.atlassian.net/browse/COPAYNI · 53 issues creados · 55 enlaces Blocks · 0 errores pendientes.

| Épica | Clave épica | Issues hijos |
|---|---|---|
| E1 Fundaciones técnicas | COPAYNI-1 | T1.1=COPAYNI-8 · T1.2=9 · T1.3=10 · T1.4=11 · T1.5=12 · T1.6=13 · T1.7=14 · T1.8=15 · T1.9=16 · T1.10=17 |
| E2 Onboarding y autenticación | COPAYNI-2 | H2.1=18 · H2.2=19 · H2.3=20 · H2.4=21 · H2.5=22 · H2.6=23 |
| E3 Círculos Game'ya | COPAYNI-3 | T3.1=24 · H3.1=25 · H3.2=26 · H3.3=27 · H3.4=28 · H3.5=29 · H3.6=30 · H3.7=31 |
| E4 Programa de ahorro | COPAYNI-4 | H4.1=32 · H4.2=33 |
| E5 Pagos y cobros | COPAYNI-5 | T5.1=34 · H5.1=35 · H5.2=36 · H5.3=37 · H5.4=38 · H5.5=39 · H5.6=40 · H5.7=41 |
| E6 Perfil y KYC | COPAYNI-6 | T6.1=42 · T6.2=43 · H6.1=44 · H6.2=45 · H6.3=46 · H6.4=47 · H6.5=48 · H6.6=49 · H6.7=50 |
| E7 Referidos | COPAYNI-7 | H7.1=51 · H7.2=52 · H7.3=53 |

Verificación por JQL:
- Tipo y story points de los 53 issues: OK (205 SP).
- Padre de las 46 tareas e historias: OK.
- Etiquetas: must 39, should 7, could 7, pendiente-diseno 5: OK.
- 41 issues con "is blocked by": OK.

Incidencia: el enlace COPAYNI-43 → COPAYNI-48 dio timeout. Se comprobó que no existía y se creó una vez.

## E.2 Revisión según la Base Técnica Enterprise Senior (2026-10-26)

Las descripciones del frontend se escribieron con la guía anterior (*por features*, `app-core`). Se reescribieron para la arquitectura hexagonal de la nueva guía. Ningún estado ni story point cambió.

| Cambio | Issues |
|---|---|
| Tareas técnicas reescritas | COPAYNI-1, 9, 13, 14, 15, 16, 17 |
| Historias con bloque "Implementación mobile (Base Técnica Enterprise Senior)" | 31: COPAYNI-18–23, 25–33, 35–41, 44–52 |
| *Definition of Done* mobile común (§21 de la guía) | En la épica COPAYNI-1; todas las historias la referencian |
| Enlaces "Blocks" nuevos | COPAYNI-8 → 28, 32, 35, 38, 40, 50 · COPAYNI-14 → 50 |
| Etiqueta corregida | COPAYNI-50: `mobile` → `fullstack` (tiene trabajo backend) |

**Conflictos resueltos con la nueva guía:**

| Issue | Antes | Ahora |
|---|---|---|
| COPAYNI-21 Sesión | "Interceptor de refresh con cola" en la capa HTTP | `RefreshSessionUseCase` con renovación única en vuelo, un reintento por petición, exclusión de `/auth/refresh` y estado `sessionExpired` (sin bucles de renovación) |
| COPAYNI-40 Tarjeta | SDK de la pasarela usado desde la UI | `CardTokenizerPort` con adaptador del proveedor elegido en COPAYNI-34; avance en paralelo con adaptador falso |
| COPAYNI-47/48 Documentos | Cámara y subida usadas desde la UI | `DocumentScannerPort` y `DocumentRepositoryPort`; permisos explicados y manejados; imágenes borradas tras subirlas |
| COPAYNI-50 Idioma | Reimplementar cambio de idioma | Reutiliza `ChangeLanguageUseCase` / `useLanguage()`; añade sincronización con el perfil sin bloquear la UI |

**Decisiones de diseño transversales que fija la revisión:**

- Los cálculos de negocio (cuotas, turnos, cashback, elegibilidad) viven en el backend; el dominio mobile solo valida coherencia (p. ej. fecha de payout posterior al inicio).
- Las historias fullstack acuerdan primero el contrato de API; el lado mobile avanza con adaptadores falsos y la historia se cierra con la integración real.
- Cada historia tiene un criterio de aceptación para el estado sin conexión.

**Decisiones de producto abiertas por la revisión** (registradas en [pending-scope.md](pending-scope.md), §3): R12–R14.

## F. Resumen de estimaciones

| Épica | SP | Confianza |
|---|---|---|
| E1 Fundaciones técnicas | 50 | Media |
| E2 Onboarding y autenticación | 23 | Media |
| E3 Círculos (Game'ya) | 39 | Baja-media |
| E4 Programa de ahorro | 8 | Baja |
| E5 Pagos y cobros | 34 | Media |
| E6 Perfil y KYC | 40 | Baja-media |
| E7 Referidos | 11 | Media |
| **Total** | **205 SP** | |

Por prioridad: **must 165 SP · should 18 SP · could 22 SP**.
Por área: plataforma E1 50 · fullstack 122 · backend 24 · mobile 9.

Supuestos:
- Un equipo con backend NestJS y mobile Expo.
- Las historias *fullstack* incluyen endpoint, UI y pruebas (unitarias, integración y componente).
- No se convierten SP a horas: no hay velocidad histórica.

Riesgos que pueden subir la estimación:
- Reglas de fees y slots (Q1–Q4).
- Integración con la pasarela, el proveedor KYC y los proveedores de payout.
- El flujo de pay-in no diseñado (estimado fuera de este total: **+20–30 SP**).
- Requisitos regulatorios.
