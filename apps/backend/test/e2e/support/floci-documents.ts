import { randomUUID } from 'node:crypto';

import { FLOCI_ENDPOINT } from '../../setup-env';

/**
 * Se importa antes que AppModule (ConfigModule lee el entorno al importarlo): la API guarda los
 * documentos en un bucket propio de S3 en floci en vez del almacenamiento simulado.
 */
export const DOCUMENTS_BUCKET = `ayni-e2e-documents-${randomUUID().slice(0, 8)}`;

Object.assign(process.env, {
  DOCUMENT_STORAGE: 's3',
  DOCUMENTS_BUCKET,
  DOCUMENTS_S3_ENDPOINT: FLOCI_ENDPOINT,
});
