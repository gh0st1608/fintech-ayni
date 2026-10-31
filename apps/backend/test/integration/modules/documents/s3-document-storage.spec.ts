import { randomUUID } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { S3DocumentStorage } from '@src/modules/documents/infrastructure/s3-document-storage';
import { InfrastructureError } from '@src/shared/errors/app-error';

import { FLOCI_ENDPOINT } from '../../../setup-env';

/**
 * El adaptador S3 de documentos (COPAYNI-43) contra floci, el emulador de AWS del ambiente dev
 * (infra/local/compose.yaml; en CI, un service). Usa un bucket propio que borra al terminar.
 */
describe('S3DocumentStorage con floci', () => {
  const bucket = `ayni-test-documents-${randomUUID().slice(0, 8)}`;
  const admin = new S3Client({
    region: 'us-east-1',
    endpoint: FLOCI_ENDPOINT,
    forcePathStyle: true,
  });
  const storage = new S3DocumentStorage({ bucket, region: 'us-east-1', endpoint: FLOCI_ENDPOINT });
  const keys: string[] = [];

  beforeAll(async () => {
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  afterAll(async () => {
    for (const Key of keys) await admin.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
    admin.destroy();
    storage.destroy();
  });

  const upload = async (
    contentType: string,
    body: Buffer,
  ): Promise<{ key: string; status: number }> => {
    const key = `kyc/u-1/national_id_front/${randomUUID()}`;
    keys.push(key);
    const { url, expiresAt } = await storage.presignUpload({
      key,
      contentType,
      expiresInSeconds: 300,
    });
    expect(url).toContain(`/${bucket}/kyc/u-1/national_id_front/`);
    expect(url).toContain('X-Amz-Expires=300');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    return { key, status: response.status };
  };

  it('la app sube con la URL prefirmada y el backend comprueba el tamaño', async () => {
    const file = Buffer.alloc(2048, 1);
    const { key, status } = await upload('image/jpeg', file);
    expect(status).toBe(200);
    await expect(storage.exists(key, 2048)).resolves.toBe(true);
    // Otro tamaño que el declarado cuenta como subida incompleta.
    await expect(storage.exists(key, 4096)).resolves.toBe(false);
  });

  it('sin archivo subido, no existe', async () => {
    await expect(storage.exists(`kyc/u-1/additional/${randomUUID()}`, 10)).resolves.toBe(false);
  });

  it('con publicEndpoint, la URL se firma para el host público y la subida llega por el gateway', async () => {
    // El gateway de dev (infra/local/gateway) reenvía la petición a floci sin cambiar la ruta ni
    // el Host, así la firma sigue siendo válida.
    const floci = new URL(FLOCI_ENDPOINT);
    const gateway: Server = createServer((incoming, outgoing) => {
      const forward = request(
        {
          host: floci.hostname,
          port: floci.port,
          method: incoming.method,
          path: incoming.url,
          headers: incoming.headers,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      incoming.pipe(forward);
    });
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    const publicEndpoint = `http://localhost:${(gateway.address() as AddressInfo).port}`;
    const viaGateway = new S3DocumentStorage({
      bucket,
      region: 'us-east-1',
      endpoint: FLOCI_ENDPOINT,
      publicEndpoint,
    });
    try {
      const key = `kyc/u-1/proof_of_income/${randomUUID()}`;
      keys.push(key);
      const { url } = await viaGateway.presignUpload({
        key,
        contentType: 'application/pdf',
        expiresInSeconds: 300,
      });
      expect(url.startsWith(`${publicEndpoint}/${bucket}/`)).toBe(true);
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: Buffer.alloc(512, 1),
      });
      expect(response.status).toBe(200);
      // La comprobación va directo a floci.
      await expect(viaGateway.exists(key, 512)).resolves.toBe(true);
    } finally {
      viaGateway.destroy();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });

  it('si el almacenamiento no responde, es un error de infraestructura', async () => {
    const down = new S3DocumentStorage({
      bucket,
      region: 'us-east-1',
      endpoint: 'http://127.0.0.1:1',
    });
    await expect(down.exists('kyc/x', 1)).rejects.toBeInstanceOf(InfrastructureError);
    down.destroy();
  });
});
