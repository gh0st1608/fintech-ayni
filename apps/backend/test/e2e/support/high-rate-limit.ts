/**
 * Se importa antes que cualquier otro módulo en las e2e que hacen muchas peticiones desde la misma
 * IP: ConfigModule lee el entorno al importar AppModule. El rate limit por IP tiene su propia
 * prueba en http-platform.e2e-spec.ts.
 */
process.env.RATE_LIMIT_MAX = '1000';
