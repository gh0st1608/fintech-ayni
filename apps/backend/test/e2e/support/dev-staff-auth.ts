/**
 * Se importa antes que cualquier otro módulo en las e2e del back-office: activa la identidad del
 * personal de desarrollo (`POST /admin/v1/dev/sessions`). ConfigModule lee el entorno al importar
 * AppModule.
 */
process.env.STAFF_AUTH_PROVIDER = 'dev';
