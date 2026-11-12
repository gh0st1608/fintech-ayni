import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** CCI válido del BCP (002) y otro del BBVA (011). */
const BCP_CCI = '00219300165123456715';
const BBVA_CCI = '01181400020012345612';

/** Cuenta de cobro registrada por el personal y vista por la persona (COPAYNI-81). */
describe('Cuenta de cobro', () => {
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

  /** Una persona que ingresó a la app, con nombre y, si se pide, el DNI aprobado. */
  async function member(verified = true): Promise<{ userId: string; token: string }> {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verifiedSession = await http()
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token = verifiedSession.body.data.accessToken as string;
    const me = await http()
      .patch('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Juana', lastName: 'Torres' })
      .expect(200);
    const userId = me.body.data.id as string;
    if (verified) {
      await database.query(
        `INSERT INTO kyc_documents (id, user_id, type, kind, status, pages, upload_ids)
         VALUES (gen_random_uuid(), $1, 'national_id', 'national_id', 'approved', 2, '{}')`,
        [userId],
      );
    }
    return { userId, token };
  }

  const put = (userId: string, token: string, body: Record<string, unknown>) =>
    http()
      .put(`/admin/v1/users/${userId}/payout-account`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Constancia enviada por la persona', ...body });

  const bank = (cci = BCP_CCI, bankCode = '002') => ({
    kind: 'bank_account',
    bankCode,
    accountType: 'savings',
    cci,
    holderName: 'Juana María Torres Pérez',
  });

  it('Operaciones la registra cifrada; la persona y el personal la ven enmascarada', async () => {
    const juana = await member();
    const operations = await staff(['operations']);

    const saved = await put(juana.userId, operations, bank()).expect(200);
    expect(saved.body.data).toMatchObject({
      kind: 'bank_account',
      label: 'BCP •••• 4567',
      bankName: 'BCP',
      accountType: 'savings',
      last4: '4567',
      replacedAt: null,
    });
    expect(JSON.stringify(saved.body)).not.toContain(BCP_CCI);

    const [row] = await database.query<{ number_encrypted: string }[]>(
      'SELECT number_encrypted FROM payout_accounts WHERE user_id = $1',
      [juana.userId],
    );
    expect(row!.number_encrypted).not.toContain(BCP_CCI);

    const mine = await http()
      .get('/v1/me/payout-account')
      .set('Authorization', `Bearer ${juana.token}`)
      .expect(200);
    expect(mine.body.data.account).toMatchObject({ label: 'BCP •••• 4567' });

    // La cuenta fija el método de cobro que exige la unión a una junta.
    const methods = await http()
      .get('/v1/me/payout-method')
      .set('Authorization', `Bearer ${juana.token}`)
      .expect(200);
    expect(methods.body.data.selected).toBe('bank_account');

    // Reemplazarla deja la anterior en el historial.
    await put(juana.userId, operations, {
      kind: 'wallet',
      provider: 'yape',
      phone: '987654321',
      holderName: 'Juana Torres',
    }).expect(200);
    const support = await staff(['support']);
    const listed = await http()
      .get(`/admin/v1/users/${juana.userId}/payout-account`)
      .set('Authorization', `Bearer ${support}`)
      .expect(200);
    expect(listed.body.data.current).toMatchObject({ label: 'Yape •••• 4321' });
    expect(listed.body.data.history).toHaveLength(2);
    expect(listed.body.data.history[1]).toMatchObject({
      label: 'BCP •••• 4567',
      replacedAt: expect.any(String),
    });
    expect(listed.body.data.banks).toMatchObject({ '002': 'BCP' });

    // La auditoría guarda el motivo y el tipo, nunca el número.
    const audit = await database.query<{ details: unknown }[]>(
      `SELECT details FROM staff_audit_log
        WHERE action = 'user.payout_account.register' AND entity_id = $1`,
      [juana.userId],
    );
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain(BCP_CCI);
    expect(JSON.stringify(audit)).not.toContain('987654321');
  });

  it('rechaza un CCI inválido, otro titular o una persona sin identidad verificada', async () => {
    const juana = await member();
    const operations = await staff(['operations']);

    const wrongDigit = await put(juana.userId, operations, bank('00219300165123456716')).expect(
      400,
    );
    expect(wrongDigit.body.error.details).toEqual({ cci: 'invalid' });
    const otherBank = await put(juana.userId, operations, bank(BBVA_CCI)).expect(400);
    expect(otherBank.body.error.details).toEqual({ cci: 'bank_mismatch' });

    const holder = await put(juana.userId, operations, {
      ...bank(),
      holderName: 'Pedro Quispe',
    }).expect(422);
    expect(holder.body.error.code).toBe('PAYOUT_ACCOUNT_HOLDER_MISMATCH');

    const unverified = await member(false);
    const identity = await put(unverified.userId, operations, bank()).expect(422);
    expect(identity.body.error.code).toBe('PAYOUT_ACCOUNT_IDENTITY_REQUIRED');

    const mine = await http()
      .get('/v1/me/payout-account')
      .set('Authorization', `Bearer ${juana.token}`)
      .expect(200);
    expect(mine.body.data.account).toBeNull();
  });

  it('solo Operaciones registra cuentas; Soporte y Finanzas solo las ven', async () => {
    const juana = await member();
    const support = await staff(['support']);
    const finance = await staff(['finance']);
    await put(juana.userId, support, bank()).expect(403);
    await put(juana.userId, finance, bank()).expect(403);
    await http()
      .get(`/admin/v1/users/${juana.userId}/payout-account`)
      .set('Authorization', `Bearer ${finance}`)
      .expect(200);
    await http()
      .get(`/admin/v1/users/${randomUUID()}/payout-account`)
      .set('Authorization', `Bearer ${support}`)
      .expect(404);
  });
});
