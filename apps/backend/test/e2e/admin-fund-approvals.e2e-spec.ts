import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Movimientos del fondo de garantía con doble aprobación (COPAYNI-73). */
describe('API del back-office: doble aprobación del fondo', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[]): Promise<{ token: string; email: string }> {
    const email = `${randomUUID()}@ayni.local`;
    const response = await http().post('/admin/v1/dev/sessions').send({ email, roles }).expect(201);
    return { token: response.body.data.accessToken as string, email };
  }

  const propose = (token: string, body: Record<string, unknown>) =>
    http()
      .post('/admin/v1/guarantee-fund/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'seed_capital', currency: 'PEN', reason: 'Acta 2026-11', ...body });
  const decide = (token: string, id: string, decision: 'approve' | 'reject', reason?: string) =>
    http()
      .post(`/admin/v1/approvals/${id}/${decision}`)
      .set('Authorization', `Bearer ${token}`)
      .send(reason ? { reason } : {});

  const fundEntries = (approvalId: string) =>
    database.query<{ amount: string }[]>(
      `SELECT amount::text AS amount FROM ledger_entries
        WHERE transaction_key = $1 AND account = 'guarantee_fund'`,
      [`seed_capital:${approvalId}`],
    );

  it('una persona propone, otra aprueba y recién entonces entra el dinero al fondo', async () => {
    const ana = await staff(['finance']);
    const luis = await staff(['finance']);
    const amount = 1_000 + Math.floor(Math.random() * 1_000_000);

    const proposed = await propose(ana.token, { amount }).expect(201);
    const approval = proposed.body.data;
    expect(approval).toMatchObject({
      status: 'pending',
      action: 'guarantee_fund.movement',
      movement: {
        kind: 'seed_capital',
        amount: { amount, currency: 'PEN' },
        reason: 'Acta 2026-11',
      },
      proposedBy: { email: ana.email },
      decidedBy: null,
    });
    expect(await fundEntries(approval.id)).toHaveLength(0);

    const self = await decide(ana.token, approval.id, 'approve').expect(403);
    expect(self.body.error.code).toBe('APPROVAL_SELF_DECISION');

    const approved = await decide(luis.token, approval.id, 'approve').expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'approved',
      decidedBy: { email: luis.email },
      decidedAt: expect.any(String),
    });
    expect(await fundEntries(approval.id)).toEqual([{ amount: String(amount) }]);

    const again = await decide(luis.token, approval.id, 'approve').expect(409);
    expect(again.body.error.code).toBe('APPROVAL_NOT_PENDING');

    const pending = await http()
      .get('/admin/v1/approvals?status=approved&limit=100')
      .set('Authorization', `Bearer ${luis.token}`)
      .expect(200);
    const approvedIds = (pending.body.data.items as { id: string }[]).map((item) => item.id);
    expect(approvedIds).toContain(approval.id);

    // Cada intento queda en la auditoría con su resultado: el propio, el válido y el repetido.
    const audit = await database.query<{ actor_email: string; outcome: string }[]>(
      `SELECT actor_email, outcome FROM staff_audit_log
        WHERE action = 'approval.approve' AND entity_id = $1 ORDER BY created_at`,
      [approval.id],
    );
    expect(audit).toEqual([
      { actor_email: ana.email, outcome: 'failed' },
      { actor_email: luis.email, outcome: 'succeeded' },
      { actor_email: luis.email, outcome: 'failed' },
    ]);
  });

  it('rechazar exige motivo y no mueve dinero', async () => {
    const ana = await staff(['finance']);
    const admin = await staff(['super_admin']);
    const approval = (await propose(ana.token, { amount: 2500 }).expect(201)).body.data;

    await decide(admin.token, approval.id, 'reject').expect(400);
    const rejected = await decide(admin.token, approval.id, 'reject', 'No coincide').expect(200);
    expect(rejected.body.data).toMatchObject({ status: 'rejected', decisionReason: 'No coincide' });
    expect(await fundEntries(approval.id)).toHaveLength(0);
  });

  it('valida la propuesta y restringe a finanzas y al admin general', async () => {
    const ana = await staff(['finance']);
    const invalid = await propose(ana.token, { amount: -5 }).expect(400);
    expect(invalid.body.error.details).toEqual({ amount: 'invalid' });
    await propose(ana.token, { kind: 'adjustment', amount: -500 }).expect(201);

    const support = await staff(['support', 'operations']);
    await propose(support.token, { amount: 100 }).expect(403);
    await http()
      .get('/admin/v1/approvals')
      .set('Authorization', `Bearer ${support.token}`)
      .expect(403);
    await decide(ana.token, randomUUID(), 'approve').expect(404);
  });

  it('filtra por estado, marca las vencidas y pagina con cursor', async () => {
    const ana = await staff(['finance']);
    const luis = await staff(['finance']);
    const first = (await propose(ana.token, { amount: 1000 }).expect(201)).body.data;
    const second = (await propose(ana.token, { amount: 2000 }).expect(201)).body.data;
    // La primera vence: se adelanta su plazo en la base.
    await database.query(
      `UPDATE staff_approvals SET proposed_at = now() - interval '4 days',
                                  expires_at = now() - interval '1 hour' WHERE id = $1`,
      [first.id],
    );
    const list = (query: string) =>
      http().get(`/admin/v1/approvals?${query}`).set('Authorization', `Bearer ${luis.token}`);

    const expired = (await list('status=expired&limit=100').expect(200)).body.data;
    expect(expired.items).toContainEqual(
      expect.objectContaining({ id: first.id, status: 'expired' }),
    );
    const pending = (await list('status=pending&limit=100').expect(200)).body.data;
    const pendingIds = (pending.items as { id: string }[]).map(({ id }) => id);
    expect(pendingIds).toContain(second.id);
    expect(pendingIds).not.toContain(first.id);
    const expiredDecision = await decide(luis.token, first.id, 'approve').expect(409);
    expect(expiredDecision.body.error.details).toEqual({ status: 'expired' });

    const page = (await list('limit=1').expect(200)).body.data;
    expect(page.items).toHaveLength(1);
    const next = (await list(`limit=1&cursor=${page.nextCursor as string}`).expect(200)).body.data;
    expect(next.items[0].id).not.toBe(page.items[0].id);
    await list('cursor=no-es-un-cursor').expect(400);
  });
});
