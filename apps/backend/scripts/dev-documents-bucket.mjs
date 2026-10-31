// Crea en floci el bucket de documentos del ambiente dev si no existe (docs/dev-environment.md).
// Usa las credenciales de prueba de floci, nunca el perfil de AWS de la máquina.
//
//   npm run dev:documents-bucket
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.DOCUMENTS_S3_ENDPOINT ?? 'http://127.0.0.1:4566';
const bucket = process.env.DOCUMENTS_BUCKET ?? 'ayni-local-documents';
if (!/^https?:\/\/(localhost|127\.0\.0\.1|floci)(:\d+)?\/?$/.test(endpoint)) {
  throw new Error(`Solo se admite floci como endpoint: ${endpoint}`);
}

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  process.stdout.write(`El bucket ${bucket} ya existe en ${endpoint}\n`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  process.stdout.write(`Bucket ${bucket} creado en ${endpoint}\n`);
} finally {
  s3.destroy();
}
