# Contenido de Home: ofertas y metas populares (COPAYNI-25, BO4 y BO5)

**Para:** PO, UX y TL. **Fecha:** 16 de noviembre de 2026. **Estado:** propuesta, pendiente de decisión.

COPAYNI-25 está **parcialmente entregada**: "Recomendados para ti" y el banner de invitación están en `main`. Faltan **"Latest Offers"** y **"Popular Goals"**, que no se construyeron por una razón deliberada: no hay de dónde sacar el contenido ni quién lo gestione, y construirlas obligaría a inventar datos.

Este documento cierra esa parte: qué muestra el diseño, qué campos propongo (BO4), si las ofertas se segmentan por usuario (BO5) y qué queda por decidir.

Convención: **[H]** hecho observado, **[I]** inferencia, **[?]** decisión pendiente.

## 1. Lo que el diseño muestra [H]

Del Figma ([Home 55:8637](https://www.figma.com/design/wu18eeCY4284Te2ITa8W5X/?node-id=55-8637) y [55:8853](https://www.figma.com/design/wu18eeCY4284Te2ITa8W5X/?node-id=55-8853)):

**Latest Offers** — carrusel de 4 láminas con puntos de página, la siguiente asomando al borde. Cada lámina tiene:

| Elemento    | En el diseño                                               |
| ----------- | ---------------------------------------------------------- |
| Subtítulo   | "Check Out Our", en gris, una línea                        |
| Título      | "LATEST OFFERS", grande, en mayúsculas, hasta dos líneas   |
| Ilustración | A la derecha, 128 × 106 (un megáfono en la primera lámina) |
| Fondo       | Un color pastel por lámina (crema, rosa…)                  |

No hay botón, ni precio, ni fecha de vigencia, ni descripción larga. **La lámina entera es el toque.**

**Popular Goals** — fila horizontal de tarjetas de 168 × 63:

| Tarjeta | Título          | Subtexto          | Color   |
| ------- | --------------- | ----------------- | ------- |
| 1       | Savings         | 20% Cashback      | Azul    |
| 2       | Ramadan         | Upto 25% Discount | Naranja |
| 3       | Summer Expenses | — (sin subtexto)  | Verde   |

Es decir: título, subtexto **opcional**, ilustración y un color de marca por tarjeta.

**Lo que el diseño no dice [?]:** a dónde lleva cada cosa, cuánto dura una oferta, en qué orden se muestran, en qué idioma, y quién las crea.

## 2. BO4 — Campos propuestos

Sigo el precedente que ya funciona en el producto: la **ayuda y la política de pagos** (COPAYNI-83) viven en la base, se editan desde el back-office y cambiarlas no exige publicar la app. Las ofertas y las metas deberían funcionar igual.

### 2.1 Oferta (lámina del carrusel)

| Campo                 | Tipo                           | Obligatorio | Notas                                                           |
| --------------------- | ------------------------------ | ----------- | --------------------------------------------------------------- |
| `id`                  | uuid                           | sí          | —                                                               |
| `subtitle`            | texto ≤ 40, por idioma (es/en) | no          | "Check Out Our"                                                 |
| `title`               | texto ≤ 60, por idioma (es/en) | sí          | Hasta dos líneas; la app no lo pone en mayúsculas por su cuenta |
| `illustration`        | clave del catálogo de la app   | sí          | Ver §2.3                                                        |
| `background`          | token del design system        | sí          | `cream`, `blush`, `mint`, `lilac`                               |
| `target`              | destino (enum, ver §2.4)       | sí          | A dónde lleva el toque                                          |
| `startsOn` / `endsOn` | fecha                          | no          | Fuera de la ventana no se muestra: una campaña caduca sola      |
| `position`            | entero                         | sí          | Orden en el carrusel                                            |
| `active`              | booleano                       | sí          | Apagar sin borrar                                               |

### 2.2 Meta popular (tarjeta)

| Campo                | Tipo                                 | Obligatorio | Notas                                           |
| -------------------- | ------------------------------------ | ----------- | ----------------------------------------------- |
| `id`                 | uuid                                 | sí          | —                                               |
| `title`              | texto ≤ 24, por idioma               | sí          | "Ahorro"                                        |
| `subtitle`           | texto ≤ 32, por idioma               | no          | "20 % de cashback"; la tercera tarjeta no tiene |
| `illustration`       | clave del catálogo                   | sí          | Ver §2.3                                        |
| `background`         | token (`primary`, `orange`, `green`) | sí          | Los tres colores del diseño                     |
| `target`             | destino (enum)                       | sí          | —                                               |
| `position`, `active` | —                                    | sí          | Igual que las ofertas                           |

### 2.3 Las ilustraciones: catálogo en la app, no imágenes subidas [I]

**Propongo que la ilustración sea una clave de un catálogo que viaja en la app** (`megaphone`, `piggy-bank`, `calendar`…), no un archivo que el personal sube.

- El diseño usa **ilustraciones de marca**, no fotos: el repertorio cambia poco y lo produce UX.
- Evita un bucket público, un CDN y moderar lo que alguien suba; también evita que una imagen pesada arruine la carga de Home.
- Funciona sin red y sin parpadeo.
- **Coste:** una ilustración nueva exige publicar la app. Si UX necesita libertad total, la alternativa es S3 + CloudFront, que suma infraestructura, revisión de contenido y un pendiente de accesibilidad (texto alternativo).

### 2.4 El destino: una lista cerrada, no una URL [I]

El toque debe llevar a una pantalla de la app elegida de una **lista cerrada**, no a una URL libre que el back-office escriba:

| Destino         | A dónde va                                       | ¿Existe hoy? |
| --------------- | ------------------------------------------------ | ------------ |
| `savings_plans` | Planes de ahorro con cashback (COPAYNI-32 y 33)  | **Sí**       |
| `join_circle`   | Flujo de unión, con un monto opcional precargado | **Sí**       |
| `referral`      | Invita a un amigo (COPAYNI-51)                   | **Sí**       |
| `help`          | Ayuda y política de pagos (COPAYNI-83)           | **Sí**       |
| `none`          | Solo informativo, no es pulsable                 | —            |

Con una URL libre, quien edite el contenido podría publicar un enlace externo dentro de la app: eso es un riesgo de phishing y un problema con las tiendas. Con la lista cerrada, la app sabe navegar y nada puede apuntar fuera. **Las tres metas del diseño caben:** "Savings" → `savings_plans`; "Ramadan" y "Summer Expenses" → `join_circle`.

## 3. BO5 — ¿Las ofertas se segmentan por usuario?

**Propuesta: no en la v1.** Todos ven la misma lista, y el modelo guarda el campo `audience` fijo en `all` para que segmentar después no rompa el contrato.

Por qué:

- **No hay con qué segmentar.** Hoy no existen grupos, etiquetas ni historial de campañas; segmentar exigiría definir y mantener reglas de audiencia en el back-office, que es trabajo de la fase de contenido completa, no de esta historia.
- **Abarata el endpoint.** Sin segmentación, el contenido es el mismo para todos: se cachea por idioma y Home carga más rápido. Con segmentación hay que resolverlo por persona en cada carga.
- **Evita decidir sobre datos personales antes de tiempo.** Segmentar por comportamiento (mora, monto, antigüedad) es tratamiento de datos para marketing y arrastra a L3 (Ley 29733): consentimiento y finalidad. Mejor decidirlo con Legal, no de paso.
- **Dejar la puerta abierta cuesta un campo.** Con `audience` en el modelo desde el inicio, agregar segmentos después es una migración de datos, no un rediseño.

Si el PO quiere segmentar en la v1, hace falta responder antes: ¿por qué atributos?, ¿quién define los segmentos?, ¿se miden las campañas (clics, conversión)? Eso convierte esta historia en una fase de marketing y conviene estimarla aparte.

## 4. Contrato propuesto

Un solo endpoint, porque las dos secciones se piden juntas al abrir Home y comparten ciclo de vida:

```
GET /v1/home/content?language=es
→ { "offers": [ … ], "goals": [ … ] }
```

- **Autenticado** (como el resto de `/v1/me`), aunque el contenido no dependa de quién mira: así se puede segmentar más adelante sin cambiar el contrato ni exponer las campañas a cualquiera.
- Devuelve **solo lo activo y vigente**, ya ordenado. Una sección vacía se oculta en la app, que es el criterio de aceptación ya acordado en COPAYNI-25.
- El idioma sale del perfil, con `es` por defecto, como en la ayuda.

En el back-office, una sección **Contenido** con las dos listas: crear, editar, reordenar, activar y apagar, con vista previa de la tarjeta. Cada cambio queda en `staff_audit_log`, como el resto de las acciones del personal.

## 5. Un hueco de producto que conviene no pasar por alto [?]

El diseño es de Marruecos: **"Ramadan" no aplica a Perú**. Las metas populares son contenido de campaña y necesitan una lista propia para el mercado peruano (por ejemplo Fiestas Patrias, campaña escolar, Navidad). Es una decisión de PO, no de ingeniería, y sin ella la sección se lanzaría vacía u ocupada con ejemplos ajenos.

"Savings" sí tiene sentido tal cual: el programa de ahorro con cashback ya existe en el producto.

## 6. Qué se puede construir y qué sigue bloqueado

| Trabajo                                                         | ¿Bloqueado?                           |
| --------------------------------------------------------------- | ------------------------------------- |
| Modelo, endpoint, sección del back-office y secciones en la app | **No**, en cuanto se aprueben §2 y §3 |
| El catálogo de ilustraciones                                    | **UX**: hacen falta los archivos      |
| El contenido real (qué ofertas y qué metas se publican en Perú) | **PO** (§5)                           |
| Segmentación por usuario                                        | **PO/Legal**, y fuera de esta v1      |

Estimación con las decisiones tomadas: **5 SP** (backend y back-office 3, app 2), confianza media. Sin el catálogo de ilustraciones se puede entregar igual con un marcador de posición, pero no se publica.

## 7. Qué hace falta decidir

1. **BO4 — campos** (§2): ¿se aprueban los de las dos tablas, con ilustración por catálogo (§2.3) y destino de lista cerrada (§2.4)? **Recomendado: sí.**
2. **BO5 — segmentación** (§3): ¿la v1 muestra lo mismo a todos, con `audience` reservado? **Recomendado: sí.**
3. **Ilustraciones** (§2.3): ¿catálogo en la app, o imágenes subidas con bucket público y moderación? **Recomendado: catálogo.**
4. **Contenido de Perú** (§5): ¿qué metas y qué ofertas se publican al lanzar?
