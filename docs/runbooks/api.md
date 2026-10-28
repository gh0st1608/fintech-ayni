# Runbook de la API (prd)

Cada alerta enlaza a su sección. Los umbrales son iniciales: se ajustan con la línea base real.

- **New Relic es el lugar principal** ([newrelic-observability](../../infra/terraform/modules/newrelic-observability)): todas las secciones de este runbook. Los issues llegan por el workflow de la política `ayni-prd-api`.
- **CloudWatch es el respaldo** ([observability](../../infra/terraform/modules/observability)): solo [api-unhealthy-targets](#api-unhealthy-targets) y [db-storage-low](#db-storage-low), para avisar aunque New Relic no esté disponible. Si llega una de CloudWatch sin su par de New Relic, revisar también que la telemetría siga llegando a New Relic.

**Herramientas:**

- **New Relic:** trazas, métricas y logs correlacionados por `traceId`.
- **CloudWatch Logs:** `/ecs/ayni-prd-api`, el log JSON del contenedor.
- **Consola de ECS:** eventos del servicio y motivo de las tareas detenidas.

Toda acción correctiva sobre la infraestructura va por el pipeline (plan revisado y apply aprobado), no por la consola. La excepción es una emergencia documentada en el incidente.

## Severidades

| Severidad  | Significado                                       | Respuesta                    |
| ---------- | ------------------------------------------------- | ---------------------------- |
| `critical` | Los usuarios están afectados o lo estarán pronto. | Atender de inmediato.        |
| `warning`  | Degradación o riesgo de capacidad.                | Revisar en horario laboral.  |

## slo-fast-burn

**Señal:** el SLO de disponibilidad consume su presupuesto de error 14,4 veces más rápido de lo permitido durante 1 hora. A ese ritmo, el presupuesto de 28 días se agota en unos 2 días.

1. Es una consecuencia, no una causa: buscar la causa en [api-error-rate](#api-error-rate) y en el dashboard `ayni-prd-api`.
2. Mientras dure, congelar los despliegues que no sean la corrección.
3. Después del incidente, registrar cuánto presupuesto se consumió (pantalla de Service Levels).

## synthetics-health

**Señal:** el health check falla desde internet en más de una ubicación, aunque las métricas internas estén bien.

1. Probar `https://backend-ayni.solutionserj.com/health/live` desde otra red.
2. **DNS:** `dig NS backend-ayni.solutionserj.com` tiene que devolver los servidores de Route 53. Si no los devuelve, revisar los registros NS en GoDaddy.
3. **Certificado:** revisar en ACM que esté emitido y vigente.
4. **WAF:** revisar si está bloqueando las ubicaciones del monitor (logs `aws-waf-logs-ayni-prd-api`).
5. Si nada de eso falla, seguir con [api-unhealthy-targets](#api-unhealthy-targets).

## api-error-rate

**Señal:** porcentaje de respuestas 5xx de las tareas, evaluado solo con tráfico suficiente.

1. En New Relic, filtrar los errores por ruta y por código (`error.code` del contrato de la API).
2. Si empezó con un despliegue: el circuit breaker vuelve atrás solo si las tareas no quedan sanas. Si quedan sanas pero responden con errores, volver a la imagen anterior: re-ejecutar el despliegue con el SHA previo.
3. Si los errores son `SERVICE_UNAVAILABLE`, revisar `/health/ready` y la sección [db-cpu-high](#db-cpu-high).
4. Si vienen de un proveedor externo (OTP, pagos, KYC), revisar el estado del proveedor.

## api-latency-p95

**Señal:** latencia p95 del balanceador hacia las tareas, sostenida.

1. Ver en New Relic qué rutas y qué spans concentran el tiempo: base de datos, proveedores externos o CPU.
2. Si coincide con [api-cpu-high](#api-cpu-high), revisar el autoescalado (máximo de tareas).
3. Si es la base de datos, revisar Performance Insights (consultas lentas y esperas de bloqueo).

## api-unhealthy-targets

**Señal:** tareas que no pasan el health check del ALB (`/health/live`).

1. Revisar los eventos del servicio en ECS y el motivo de detención de las tareas (`stoppedReason`).
2. Las causas típicas son:
   - una configuración inválida: la API no arranca y escribe en el log una línea JSON `fatal`;
   - falta de memoria (exit code 137);
   - una imagen que no existe.
3. Un secreto vacío impide arrancar la tarea (p. ej. la license key de New Relic sin valor): ver [infra/terraform/README.md](../../infra/terraform/README.md).

## api-cpu-high

**Señal:** CPU promedio del servicio.

1. Confirmar si el autoescalado ya está en su máximo (`max_capacity`).
2. Si es tráfico legítimo, subir `max_capacity` o el tamaño de la tarea en el stack de prd.
3. Si es tráfico abusivo, revisar las peticiones bloqueadas en los logs de WAF (`aws-waf-logs-ayni-prd-api`) y ajustar el rate limit.

## api-memory-high

**Señal:** memoria promedio del servicio.

1. Si crece de forma sostenida sin más tráfico, sospechar una fuga: comparar con el despliegue anterior.
2. Mientras se investiga, subir la memoria de la tarea en el stack de prd.

## db-cpu-high

**Señal:** CPU de la instancia RDS.

1. En Performance Insights, identificar las consultas con más carga.
2. Si es una consulta nueva de un despliegue, corregirla (índice o consulta). Si no se puede de inmediato, volver a la versión anterior.
3. Si es crecimiento sostenido, subir la clase de instancia: es un cambio con reinicio, que en Multi-AZ hace failover.

## db-storage-low

**Señal:** espacio libre de la base de datos.

1. El autoescalado de almacenamiento crece hasta `max_allocated_storage`. Si ya llegó, subirlo en el stack de prd.
2. Revisar qué tablas crecen (auditoría, logs dentro de la base) y si corresponde una política de retención.
