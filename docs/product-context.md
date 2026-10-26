# Contexto de producto — Ayni (diseño "Dart – ROSCA Fintech Mobile App")

Fuente: Figma `wu18eeCY4284Te2ITa8W5X` — páginas **Screens** (`0:1`, 37 frames) y **Assets** (`55:6886`: diagrama ROSCA, User Flow, wireframes, thumbnails).
Análisis realizado el 2026-10-25 con capturas a resolución nativa de todas las pantallas.

> Convención: **[H]** hecho observado en el diseño · **[I]** inferencia técnica · **[?]** decisión pendiente.

Enlace a nodo: `https://www.figma.com/design/wu18eeCY4284Te2ITa8W5X/?node-id=<id con guion>` (ej. `55-8637`).

## 1. Objetivo del producto

App mobile de **ahorro colaborativo tipo ROSCA** (Game'ya / pandero / junta). [H] Un grupo aporta una cuota mensual a un fondo común y cada mes un miembro recibe el total ("Month One Winner" recibe $9.000 de un pozo de $10.000 en el diagrama `55:6887`). La app también ofrece **programas de ahorro con cashback**, KYC por documentos, métodos de cobro y referidos.

[H] Moneda en el diseño: **MAD** (dírham marroquí); textos en inglés y opción árabe. [?] Ayni es una cooperativa (Perú, según el nombre); confirmar moneda (PEN), idiomas (ES/QU?), regulador ("Central Bank") y proveedores locales (Fawry es egipcio).

## 2. Actores

- **Usuario / miembro** (único actor con UI). [I] Back-office/administrador necesario para crear círculos, revisar documentos y operar pagos, pero **no tiene diseño**.

## 3. Inventario de pantallas

| Módulo | Nodo | Frame | Objetivo y elementos clave |
|---|---|---|---|
| Onboarding | 55:10698 | Splash | Loader inicial |
| | 55:10702 / 55:10706 | Splash 1 / 2 | Logo sobre fondo azul / claro |
| | 55:10710 | Onboarding | "Welcome to Dart", texto de valor, botón Continue |
| | 55:10724 | Signin/Signup | Campo único Email/Phone, Continue, enlaces Terms of Use y Privacy Policy. El texto menciona "social accounts", pero no hay botones sociales |
| | 55:10749 | Verify OTP | 4 dígitos enviados al email, contador 02:39, Resend, checkbox "Remember Me" |
| Home | 55:8637 / 55:8853 | Home | Carrusel "Latest Offers", banner de invitación (150 **USD**), carrusel "Recommended for you" (tarjeta de círculo), "Popular Goals" (Savings 20% cashback, Ramadan 25% descuento), iconos de fuego y campana, tab bar + botón central "+" |
| | 55:9520 | Home / Payout Method | Radio: Digital Wallets · Prepaid Card ("No Charge", límite 100.000 MAD) · Bank Transfer ("No Charge") · Fawry (deshabilitado, "Not available"); botón Continue |
| Circles | 55:9572 | Circles | Tabs Active/Finished; estado vacío "Your active circles will appear here!"; recomendados |
| | 55:9688 | Circles (Joined) | Tarjeta de círculo unido: monto total, cuota mensual, badge "Joined", línea de 12 meses con "Your Turn", fechas de inicio y fin, Admin Fees |
| Join | 55:9069 | Join (Choose a Service) | "Join a Game'ya" (payout de hasta 120.000 MAD) / "Join Saving Program" (hasta 1.000.000 MAD, 20% de cashback) |
| | 55:9091 | Payout Amount (paso 1/4) | Slider 3.000–120.000 MAD; carrusel informativo "Learn More"; Next |
| | 55:9334 | Monthly Pay-in (paso 2/4) | Resumen editable; opciones: 5000×6, 3000×10, 2500×12 meses; aviso de que la cuota varía según el slot |
| | 55:9377 | Slot (paso 3/4) | Tipos de turno: Fastest Payout (primeros slots, con fees), Lowest Fees (slots intermedios), Highest Return (últimos slots, descuento en pay-ins) |
| | 55:9444 | Slot / Highest Return | Selector de tipo + tarjetas de mes (March 5th: 2400 MAD de fees; April 6th: Zero Fees, 1200 MAD de descuento); "Admin Fees se reparten en partes iguales hasta el mes de payout"; "Continue with April" |
| Saving | 55:9164 | Choose a Saving Circle | Planes Lite 3k, Bronze 6k, Silver 12k, Gold 30k, "Silver" 60k, "Silver" 100k, con "Up to X MAD extra" (20%) |
| | 55:9220 | Choose Duration (bottom sheet) | 6/12/24 meses con cuota (500/250/125); Starts On, Payout Date, Total Payout (3.150 MAD); Next |
| Payment | 55:9846 | Payment | Estado vacío "You don't have any payment due yet", "Join New Circle"; sección Others: Payout Eligibility, Payment Settings, Payment History, Payment Policy, Help |
| | 55:9892 | Payment Eligibility | Checklist: National ID ✔, Insurance Note ⚠, Payout Method Selected ⚠, Contract ⚠, Due Payments ✔ |
| | 55:10052 | Payment Settings | Toggle "Deduct pay-in from payout"; Change Payout Method (solo antes del mes de payout); Saved Cards |
| | 55:10144 | Saved Cards (Empty) | Estado vacío |
| | 55:10087 | Saved Cards | Lista con tarjeta enmascarada (Visa ****0215, MC ****9834), radio de predeterminada, editar, eliminar; "Add Card" (Visa/MC/UnionPay) |
| | 55:10158 | Add Card | Card Number, Name on Card, mes y año de expiración, CVC; Save |
| | 55:9944 | Payment History (Empty) | Estado vacío + "Explore Circles" |
| | 55:9962 / 55:10018 | Payment History | Tabs Payments/Payouts; ítem con monto, fecha y hora, mes del círculo |
| Profile | 55:10201 | Profile | Avatar, nombre y teléfono; tarjeta "Monthly Pay-in-Limit 3,000 MAD"; Account (Personal Information, My Documents, Invite Friends), Security (Change Passcode, Enable Biometrics), Settings (Language), Support (Get Help), Log out |
| | 55:10379 | Personal Info | Nombre, apellido, código de país + teléfono, email (las etiquetas dicen "First Name" tres veces: error de diseño) |
| | 55:10523 | My Documents | National ID (verifica identidad), Proof of Income (aumenta el límite), Utility Bill (New), Car License, Club ID, Syndicate ID |
| | 55:10598 | Scan National ID | Guía para escanear ambas caras con ejemplos "Don't"; "As required by Central Bank, users must upload their valid National ID before joining a Game'ya"; botón Scan |
| | 55:10630 | Proof of Income | HR Letter (firmada y sellada) o Bank Statement (últimos 3 meses); "More documents, bigger payouts" |
| | 55:10662 | Your Monthly Income | Ingreso mensual (MAD) para calcular el límite; Next deshabilitado si está vacío |
| | 55:10677 | Upload HR Letter | Guía (bien iluminado, dentro del marco, de los últimos 3 meses); Scan Document |
| | 55:10285 | Change Language | Bottom sheet English/Arabic; Save deshabilitado hasta que haya un cambio |
| Referrals | 55:10419 | Refer a friend | "Get 150 MAD OFF", 3 pasos, código copiable, "Share your invite", "Track your invitations" |
| | 55:10456 | My Referrals (sheet) | Earned/Redeemed/Balance; "se descuenta automáticamente del próximo pay-in"; lista de invitados (vacía) |

## 4. Flujos (según el User Flow `55:8012` y las pantallas)

1. **Onboarding:** Splash → Title → Login/Sign up → Email/Phone → Verify OTP → Home. [H]
2. **Unirse a Game'ya:** "+" o "Join now" → Choose a Service → Payout Amount → Monthly Pay-in → Slot → *(Payout Method)* → *Confirm*. [H] El User Flow incluye "Payout Method" y "Confirm", pero **no existe pantalla de confirmación**.
3. **Programa de ahorro:** Choose a Service → Choose a Saving Circle → Choose Duration → Next → *(sin pantalla siguiente)*. [?]
4. **Pagos:** Payment → Eligibility (National ID, Insurance Note, Payout Method, Contract) / Settings (Payout Method → *Add Account*, Saved Cards → Add Card) / History / Policy / Help. [H] *Add Account*, Policy y Help **no tienen pantalla**.
5. **Perfil:** Personal Info / Documents (National ID, Proof of Income → Income → HR Letter) / Referrals / Change Password / Language. [H]

## 5. Requisitos derivados

**Funcionales confirmados [H]:** registro e inicio de sesión sin contraseña (email/teléfono + OTP de 4 dígitos con reenvío); exploración de círculos recomendados; unión a un Game'ya en 4 pasos (monto 3k–120k, cuota y duración, tipo de turno y mes, método de cobro); círculos activos y finalizados; planes de ahorro con cashback y duración de 6/12/24 meses; checklist de elegibilidad para cobrar; métodos de cobro; deducción automática del pay-in desde el payout; tarjetas guardadas (alta, edición, baja, predeterminada); historial de pagos y cobros; perfil, datos personales y límite mensual; carga de documentos KYC (6 tipos); ingreso mensual; idioma EN/AR; referidos con código y saldo.

**Reglas visibles [H]:**
- El National ID es obligatorio antes de unirse a un Game'ya (requisito del "Central Bank").
- El límite mensual de pay-in se calcula con el ingreso mensual; más documentos aumentan el límite.
- Las Admin Fees se reparten en partes iguales sobre los pay-ins hasta el mes de payout.
- Los primeros slots pagan fees; los últimos reciben descuento; la cuota varía según el slot.
- El método de cobro solo puede cambiarse antes del mes de payout.
- Prepaid Card: límite de 100.000 MAD.
- Referido: el invitado obtiene 150 de descuento en su primer pay-in; el invitador obtiene 150 en su siguiente pay-in cuando el invitado liquida el primero. El saldo se descuenta automáticamente.
- Payout del Game'ya de hasta 120.000 MAD; ahorro de hasta 1.000.000 MAD y hasta 20% de cashback.

**No funcionales e inferidos [I]:** cumplimiento PCI-DSS (tokenizar tarjetas en la pasarela; nunca almacenar PAN ni CVC); cifrado y retención de documentos KYC; auditoría de operaciones financieras; idempotencia en pagos y uniones a círculos; soporte RTL para árabe; accesibilidad (lector de pantalla, contraste, tamaño de texto); almacenamiento seguro de sesión (SecureStore); rate limiting del OTP.

## 6. Inconsistencias del diseño

1. El banner de Home dice "150 **USD**"; Referidos dice "150 **MAD**".
2. Los planes de 60k y 100k se llaman "Silver Saver" (duplicado del de 12k).
3. Choose Duration: "Starts On Nov 2024" y "Payout Date **Apr 2024**" (anterior al inicio); Total Payout de 3.150 (5%) frente a "Up to 600 MAD extra" (20%).
4. Personal Info: las tres etiquetas dicen "First Name".
5. Payout History: el segundo ítem dice "40,00 MAD … You have **paid**" dentro de la pestaña Payouts.
6. Las opciones de pay-in (5000×6 = 30.000; 3000×10 = 30.000; 2500×12 = 30.000) cuadran con un payout de 30.000, pero la tarjeta recomendada muestra 24.000 con 2000×12 = 24.000 **más** 2.880 de Admin Fees: hay que confirmar cómo se suman las fees.
7. Payment Settings repite el subtítulo "Make sure to correct the following" de la pantalla de Eligibility.
