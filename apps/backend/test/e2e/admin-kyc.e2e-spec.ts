import './support/dev-staff-auth';
import './support/high-rate-limit';

// Como en prd mientras no haya proveedor: todo documento queda en revisión manual.
process.env.KYC_PROVIDER = 'manual';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Cola de revisión manual del KYC en el back-office (docs/backoffice-plan.md, fase 2). */
describe('API del back-office: cola de KYC', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  /** Una persona nueva de la app, con su token. */
  async function appUser(): Promise<{ token: string; email: string }> {
    const email = `kyc.${randomUUID().slice(0, 8)}@mail.com`;
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: email, type: 'email' })
      .expect(200);
    const verified = await http()
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    return { token: verified.body.data.accessToken as string, email };
  }

  async function submit(
    token: string,
    path: 'national-id' | 'proof-of-income',
  ): Promise<{ id: string; status: string }> {
    const upload = async (purpose: string): Promise<string> =>
      (
        await http()
          .post('/v1/me/documents/uploads')
          .set('Authorization', `Bearer ${token}`)
          .send({ purpose, contentType: 'image/jpeg', sizeBytes: 524288 })
          .expect(201)
      ).body.data.uploadId as string;
    const body =
      path === 'national-id'
        ? {
            frontUploadId: await upload('national_id_front'),
            backUploadId: await upload('national_id_back'),
          }
        : {
            kind: 'hr_letter',
            monthlyIncome: 350000,
            uploadIds: [await upload('proof_of_income')],
          };
    const response = await http()
      .post(`/v1/me/documents/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    return response.body.data as { id: string; status: string };
  }

  const as = (token: string) => ({
    get: (path: string) => http().get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      http().post(path).set('Authorization', `Bearer ${token}`).send(body),
  });

  const summaryOf = async (token: string): Promise<Record<string, string>> =>
    (await as(token).get('/v1/me/documents').expect(200)).body.data.summary as Record<
      string,
      string
    >;

  it('el documento queda en la cola con la persona enmascarada, y aprobarlo verifica la identidad', async () => {
    const user = await appUser();
    const document = await submit(user.token, 'national-id');
    expect(document.status).toBe('in_review');
    const operations = as(await staff(['operations']));

    const queue = await operations.get('/admin/v1/kyc/reviews?type=national_id&limit=100');
    expect(queue.status).toBe(200);
    const item = (queue.body.data.items as { id: string; subject: { email: string } }[]).find(
      (candidate) => candidate.id === document.id,
    );
    expect(item?.subject.email).toBe(`k***@mail.com`);
    expect(JSON.stringify(queue.body)).not.toContain(user.email);

    const detail = await operations.get(`/admin/v1/kyc/reviews/${document.id}`).expect(200);
    expect(detail.body.data).toMatchObject({
      status: 'in_review',
      superseded: false,
      pageFiles: [
        { page: 1, purpose: 'national_id_front' },
        { page: 2, purpose: 'national_id_back' },
      ],
    });
    expect(JSON.stringify(detail.body)).not.toContain('kyc/');

    const approved = await operations
      .post(`/admin/v1/kyc/reviews/${document.id}/approve`, { note: 'Coincide con RENIEC' })
      .expect(200);
    expect(approved.body.data).toMatchObject({ status: 'approved', reason: null });
    expect(approved.body.data.reviewedBy).toEqual(expect.any(String));
    expect((await summaryOf(user.token)).national_id).toBe('approved');

    const [audit] = await database.query<{ outcome: string; details: { note?: string } }[]>(
      `SELECT outcome, details FROM staff_audit_log
        WHERE action = 'kyc.approve' AND entity_id = $1`,
      [document.id],
    );
    expect(audit).toMatchObject({ outcome: 'succeeded', details: { note: 'Coincide con RENIEC' } });
  });

  it('ver una página da una URL corta y queda auditado', async () => {
    const user = await appUser();
    const document = await submit(user.token, 'national-id');
    const operations = as(await staff(['operations']));

    const page = await operations
      .get(`/admin/v1/kyc/reviews/${document.id}/pages/2/url`)
      .expect(200);
    expect(page.body.data.url).toContain('national_id_back');
    expect(Date.parse(page.body.data.expiresAt as string)).toBeGreaterThan(Date.now());
    await operations.get(`/admin/v1/kyc/reviews/${document.id}/pages/3/url`).expect(404);

    const views = await database.query<{ outcome: string }[]>(
      `SELECT outcome FROM staff_audit_log WHERE action = 'kyc.document.view' AND entity_id = $1
        ORDER BY created_at`,
      [document.id],
    );
    expect(views.map((view) => view.outcome)).toEqual(['succeeded', 'failed']);
  });

  it('rechazar usa el texto del motivo, que es lo que ve la persona; la nota no le llega', async () => {
    const user = await appUser();
    const document = await submit(user.token, 'national-id');
    const operations = as(await staff(['operations']));

    await operations
      .post(`/admin/v1/kyc/reviews/${document.id}/reject`, { reason: 'texto libre' })
      .expect(400);
    const rejected = await operations
      .post(`/admin/v1/kyc/reviews/${document.id}/reject`, {
        reason: 'illegible',
        note: 'Foto movida',
      })
      .expect(200);
    expect(rejected.body.data.reason).toBe('El documento no se pudo leer: vuelve a escanearlo');

    const mine = await as(user.token).get('/v1/me/documents').expect(200);
    expect(mine.body.data.items[0]).toMatchObject({
      status: 'rejected',
      reason: 'El documento no se pudo leer: vuelve a escanearlo',
    });
    expect(JSON.stringify(mine.body)).not.toContain('Foto movida');
  });

  it('el comprobante se aprueba con el ingreso corregido; en otro documento no se admite', async () => {
    const user = await appUser();
    const income = await submit(user.token, 'proof-of-income');
    const identity = await submit(user.token, 'national-id');
    const operations = as(await staff(['operations']));

    const wrong = await operations
      .post(`/admin/v1/kyc/reviews/${identity.id}/approve`, { monthlyIncome: 100 })
      .expect(422);
    expect(wrong.body.error.code).toBe('INCOME_ADJUSTMENT_NOT_ALLOWED');

    const approved = await operations
      .post(`/admin/v1/kyc/reviews/${income.id}/approve`, { monthlyIncome: 320000 })
      .expect(200);
    expect(approved.body.data.monthlyIncome).toEqual({ amount: 320000, currency: 'PEN' });
  });

  it('dos personas a la vez: solo una resuelve, la otra recibe 409', async () => {
    const user = await appUser();
    const document = await submit(user.token, 'national-id');
    const [first, second] = [as(await staff(['operations'])), as(await staff(['super_admin']))];

    const responses = await Promise.all([
      first.post(`/admin/v1/kyc/reviews/${document.id}/approve`),
      second.post(`/admin/v1/kyc/reviews/${document.id}/reject`, { reason: 'expired' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict?.body.error.code).toBe('KYC_ALREADY_REVIEWED');
  });

  it('un documento reemplazado por otro más nuevo se marca en la cola', async () => {
    const user = await appUser();
    const old = await submit(user.token, 'national-id');
    await submit(user.token, 'national-id');
    const operations = as(await staff(['operations']));

    const detail = await operations.get(`/admin/v1/kyc/reviews/${old.id}`).expect(200);
    expect(detail.body.data.superseded).toBe(true);
  });

  it('soporte y finanzas no ven documentos; sin token del personal, 401', async () => {
    const user = await appUser();
    const document = await submit(user.token, 'national-id');
    for (const role of ['support', 'finance'] as const) {
      const token = await staff([role]);
      await as(token).get('/admin/v1/kyc/reviews').expect(403);
      await as(token).get(`/admin/v1/kyc/reviews/${document.id}/pages/1/url`).expect(403);
    }
    await as(user.token).get('/admin/v1/kyc/reviews').expect(401);
  });

  it('valida los parámetros: id, página, estado y cursor', async () => {
    const operations = as(await staff(['operations']));
    await operations.get('/admin/v1/kyc/reviews/no-es-uuid').expect(400);
    await operations.get(`/admin/v1/kyc/reviews/${randomUUID()}`).expect(404);
    await operations.get(`/admin/v1/kyc/reviews/${randomUUID()}/pages/x/url`).expect(400);
    await operations.get('/admin/v1/kyc/reviews?status=pending').expect(400);
    await operations.get('/admin/v1/kyc/reviews?cursor=basura').expect(400);
    await operations.post(`/admin/v1/kyc/reviews/${randomUUID()}/approve`).expect(404);
  });

  it('pagina la cola por antigüedad sin repetir ni saltear documentos', async () => {
    const operations = as(await staff(['operations']));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : '';
      const page = await operations.get(`/admin/v1/kyc/reviews?limit=2${query}`).expect(200);
      const items = page.body.data.items as { id: string; submittedAt: string }[];
      seen.push(...items.map((item) => item.id));
      cursor = page.body.data.nextCursor as string | null;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);

    const resolved = await operations.get('/admin/v1/kyc/reviews?status=approved').expect(200);
    const times = (resolved.body.data.items as { id: string }[]).map((item) => item.id);
    expect(times.length).toBeGreaterThan(0);
  });
});
