import { FLOCI_ENDPOINT } from '../../setup-env';

/**
 * Se importa antes que AppModule (ConfigModule lee el entorno al importarlo): la API envía el OTP
 * de verdad, por email con el SES de floci, en vez de usar el código fijo de desarrollo.
 */
export const OTP_EMAIL_FROM = 'Ayni <no-reply@ayni-test.pe>';

delete process.env.OTP_DEV_CODE;
Object.assign(process.env, {
  OTP_DELIVERY: 'aws',
  OTP_EMAIL_FROM,
  OTP_SES_ENDPOINT: FLOCI_ENDPOINT,
});
