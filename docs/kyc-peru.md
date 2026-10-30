# Propuesta KYC para Perú: documentos obligatorios y proveedor de verificación

**Estado:** propuesta para decidir con el PO, Legal y Cumplimiento (pending-scope R11, T4, L3 y L5). Implementa el spike COPAYNI-42. Nada de esto está aprobado.

**Fuentes y límites:** la investigación se cortó por el límite de búsquedas. Lo marcado con [verificar] se basa en material de proveedores o en conocimiento general y hay que confirmarlo con el proveedor o con Legal. No hay precios: se piden en la PoC.

## 1. Contexto regulatorio [verificar con Legal]

- Ayni es una cooperativa. Las COOPAC están bajo supervisión de la SBS y son sujetos obligados ante la UIF-Perú: deben aplicar debida diligencia del cliente (conocer, verificar, monitorear) con un enfoque basado en riesgo.
- La SBS publica una guía sobre herramientas digitales para la debida diligencia no presencial: validación contra RENIEC y biometría para autenticar a distancia ([guía SBS](https://www.sbs.gob.pe/Portals/5/jer/GUIAS_OC/Guia_Herramientas_Digitales.pdf)).
- Para cuentas simplificadas la SBS pide como mínimo el DNI o el carné de extranjería y el nombre, verificados contra RENIEC, Migraciones u otra modalidad que deje constancia ([Res. SBS 2891-2018](https://intranet2.sbs.gob.pe/dv_int_cn/1794/v1.0/Adjuntos/2891-2018.pdf)).
- **Riesgo de cambio en 2026:** RENIEC anunció el fin de las consultas biométricas por línea dedicada para servicios no presenciales. La autenticación pasaría a su plataforma **ID Perú**, con DNI electrónico o biometría facial ([nota](https://revistaganamas.com.pe/reniec-detecta-uso-irregular-de-consultas-biometricas-y-anuncia-el-fin-del-sistema-actual-en-2026/), [RENIEC](https://identidad.reniec.gob.pe/b/reniec-presenta-aplicativo-de-validacion-biometrica-para-proteger-los-datos-de-los-peruanos)). La fecha no está confirmada. Es el criterio más importante al elegir proveedor.

## 2. Documentos obligatorios (propuesta para R11)

Niveles de verificación por riesgo: se pide más a medida que el usuario mueve más dinero. Así no se frena el registro y se cumple la debida diligencia donde importa.

| Nivel | Para qué                                              | Qué se pide                                                                                                                                                  | Verificación                                                               |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 0     | Registrarse y ver círculos y planes                   | Email o teléfono verificado (OTP)                                                                                                                            | Ya implementado                                                            |
| 1     | Unirse a un Game'ya o suscribirse a un plan de ahorro | **DNI** (ambas caras) o **carné de extranjería**, **selfie con prueba de vida** e **ingreso mensual declarado**                                              | RENIEC o Migraciones (datos y biometría facial); listas restrictivas y PEP |
| 2     | Cobrar el payout o superar el límite base             | **Comprobante de ingresos**: boletas de pago (2 últimas), carta de RR. HH. o extractos (3 meses). Independientes: recibos por honorarios o declaración SUNAT | Operaciones o proveedor (OCR); el ingreso aprobado fija el límite (R5)     |
| 3     | Debida diligencia reforzada                           | **Recibo de servicios** (domicilio, de menos de 3 meses), **declaración de origen de fondos**                                                                | Manual, por Cumplimiento                                                   |

Reglas que acompañan:

- **Cuándo aplica el nivel 3:** PEP, coincidencia en listas, montos por encima de un umbral que fije Cumplimiento, o alertas del monitoreo.
- **Cuenta de cobro:** tiene que estar a nombre del titular verificado (se valida al registrar la cuenta, T5).
- **Vigencia:**
  - El DNI tiene que estar vigente según RENIEC.
  - El comprobante de ingresos se renueva cada 12 meses.
  - El recibo de servicios vale 3 meses.
  - Al vencer, el límite vuelve al base, sin bloquear los círculos en curso.
- **Rechazos:** siempre con un motivo legible y un reintento. Tras 3 rechazos del National ID, el caso pasa a revisión manual.
- **Licencia y otros carnés** (COPAYNI-49): no se piden como identidad, porque no se validan contra RENIEC. Quedan como respaldo opcional en revisión manual.

Impacto en el backend actual (cambios menores, no implementados):

- La selfie con prueba de vida es un nuevo `purpose` y se envía junto al National ID.
- El carné de extranjería es un `kind` de `national_id`.
- El nivel 1 exige además el ingreso declarado, que hoy se asume (`JOIN_IDENTITY_CHECK`).
- El nivel 2 bloquea el payout sin comprobante aprobado: es el requisito `proof_of_income` de la elegibilidad (COPAYNI-36).

## 3. Proveedor de verificación (propuesta para T4)

### Qué debe cubrir

1. DNI y carné de extranjería peruanos: captura, OCR y detección de fraude documental.
2. Prueba de vida pasiva y comparación facial **contra la foto de RENIEC**, no solo contra la foto del DNI.
3. Camino claro hacia **ID Perú** si RENIEC cierra el acceso actual.
4. Listas restrictivas y PEP de Perú (o un proveedor aparte).
5. SDK para React Native que funcione en un _development build_ de Expo. Ninguno corre en Expo Go [verificar].
6. Webhooks firmados, resultado con motivo y revisión manual en su consola.
7. Datos: región de procesamiento, retención configurable y no reutilizar imágenes (L3, L5).

### Opciones

| Opción                                   | Ejemplos [verificar]                                                                                                                                                                                                                            | A favor                                                                                | En contra                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **A. Especialista regional con RENIEC**  | [Autentikar](https://www.revistaeconomia.com/autentikar-amplia-su-presencia-en-peru-con-soluciones-de-identidad-digital-y-biometria/) (RENIEC y liveness), VerificaID ([KYC en Perú](https://verifica.id/que-es-kyc-y-como-cumplirlo-en-peru/)) | Biometría contra RENIEC, conoce a la SBS, soporte local                                | Menos maduro en SDK móvil y en antifraude documental; preguntar por ID Perú            |
| **B. Plataforma de LatAm**               | MetaMap, Truora                                                                                                                                                                                                                                 | SDK móvil, flujos configurables, validaciones gubernamentales en varios países, listas | La validación con RENIEC puede ser solo de datos y no biométrica: confirmar            |
| **C. Plataforma global + RENIEC aparte** | Sumsub, Veriff, Onfido, Jumio, Incode, más una API de datos RENIEC como [Floid](https://www.floid.io/pe/servicios/api-reniec)                                                                                                                   | Antifraude documental y liveness de primer nivel, listas y monitoreo incluidos         | Dos proveedores; la consulta de datos no basta para la debida diligencia no presencial |
| **D. Solo APIs de consulta de DNI**      | [API Perú](https://apiperu.pe/api-dni/), [Scrall](https://www.scrall.net/)                                                                                                                                                                      | Barato y simple                                                                        | **Descartada:** solo devuelve datos, sin biometría ni prueba de vida                   |

Un artículo del sector señala que capturar el DNI sin validarlo contra RENIEC no cumple la debida diligencia, y recomienda sumar huella del dispositivo y señales de comportamiento ([Altimea](https://www.altimea.com/blog/biometria-facial-fintech-peru/)).

### Recomendación

1. **PoC de 2 semanas con un proveedor de A y uno de B.** Mismos 30 casos: DNI reales del equipo, fotos borrosas, DNI vencido, foto de una pantalla y selfie con otra persona.
2. **Elegir por:**
   - Biometría contra RENIEC e ID Perú (eliminatorio).
   - Tasa de aprobación legítima y de fraude detectado en la PoC.
   - SDK en el development build de Expo.
   - Precio por verificación y mínimos.
   - Contrato de datos (región, retención).
3. **C** queda de respaldo si ninguno de A o B pasa el antifraude documental.
4. El backend ya está preparado: el proveedor elegido es un adaptador de `IdentityVerifierPort`, más un webhook para los resultados asíncronos. Mientras tanto, production usa `KYC_PROVIDER=manual`.

### Preguntas para los proveedores

- ¿Comparan la selfie contra la foto de RENIEC? ¿Con qué convenio? ¿Qué pasa con el cambio a ID Perú en 2026?
- ¿Cubren el carné de extranjería con Migraciones?
- ¿Tienen SDK de React Native compatible con Expo SDK 58 (development build)?
- ¿Dónde procesan y guardan las imágenes y por cuánto tiempo? ¿Se puede borrar a pedido?
- ¿Incluyen listas restrictivas y PEP de Perú? ¿Monitoreo continuo?
- ¿Precio por verificación, mínimos mensuales y costo de la revisión manual?
