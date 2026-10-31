// Clave JWT fija para desarrollo (docs/dev-environment.md): sin ella, la API genera una efímera al
// arrancar y la app pide ingresar de nuevo tras cada reinicio. Solo para .env local; en los
// ambientes desplegados la clave llega de Secrets Manager.
//
//   npm run dev:jwt-key >> .env
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim();
process.stdout.write(`JWT_PRIVATE_KEY="${pem.replaceAll('\n', '\n')}"\n`);
