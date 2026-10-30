import './support/high-rate-limit';
import { DOCUMENTS_BUCKET as BUCKET } from './support/floci-documents';

import { randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

import { FLOCI_ENDPOINT } from '../setup-env';

/** Subida real de documentos KYC (COPAYNI-43 y 47) a S3 en floci, con la URL prefirmada. */
describe('Documentos en S3 (floci)', () => {
  const admin = new S3Client({
    region: 'us-east-1',
    endpoint: FLOCI_ENDPOINT,
    forcePathStyle: true,
  });
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
    app = await createTestApp({ verifier: null });
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    token = (
      await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
    const { Contents = [] } = await admin.send(new ListObjectsV2Command({ Bucket: BUCKET }));
    for (const { Key } of Contents) {
      await admin.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
    }
    await admin.send(new DeleteBucketCommand({ Bucket: BUCKET }));
    admin.destroy();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/v1/me/documents${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  async function ticket(purpose: string, sizeBytes: number) {
    const response = await post('/uploads', {
      purpose,
      contentType: 'image/jpeg',
      sizeBytes,
    }).expect(201);
    return response.body.data as { uploadId: string; uploadUrl: string };
  }

  const put = (url: string, body: Buffer) =>
    fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body });

  it('la app sube a S3 y el backend acepta solo las subidas completas', async () => {
    const front = await ticket('national_id_front', 2048);
    const back = await ticket('national_id_back', 1024);
    expect((await put(front.uploadUrl, Buffer.alloc(2048, 7))).status).toBe(200);

    // El reverso todavía no se subió.
    const pending = await post('/national-id', {
      frontUploadId: front.uploadId,
      backUploadId: back.uploadId,
    }).expect(422);
    expect(pending.body.error).toMatchObject({
      code: 'UPLOAD_NOT_USABLE',
      details: { uploadId: back.uploadId },
    });

    // Un archivo de otro tamaño que el declarado tampoco sirve.
    expect((await put(back.uploadUrl, Buffer.alloc(10, 7))).status).toBe(200);
    await post('/national-id', {
      frontUploadId: front.uploadId,
      backUploadId: back.uploadId,
    }).expect(422);

    expect((await put(back.uploadUrl, Buffer.alloc(1024, 7))).status).toBe(200);
    const accepted = await post('/national-id', {
      frontUploadId: front.uploadId,
      backUploadId: back.uploadId,
    }).expect(200);
    expect(accepted.body.data).toMatchObject({ type: 'national_id', status: 'approved' });
  });
});
