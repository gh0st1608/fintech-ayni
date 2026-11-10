import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Ejecuciones del ciclo mensual en el back-office (docs/backoffice-plan.md, fase 2). */
describe('API del back-office: ejecuciones del ciclo', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  it('cada ejecución de la tarea diaria queda registrada y se lista de la más reciente', async () => {
    const useCase = app.get(AdvanceCircleCyclesUseCase);
    await useCase.execute();
    await useCase.execute();

    const token = await staff(['support']);
    const first = await http()
      .get('/admin/v1/cycle-runs?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const [latest] = first.body.data.items as {
      id: string;
      businessDate: string;
      startedAt: string;
      failed: number;
      failures: unknown[];
    }[];
    expect(latest).toMatchObject({ failed: expect.any(Number), failures: expect.any(Array) });
    expect(latest?.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.body.data.nextCursor).toEqual(expect.any(String));

    const second = await http()
      .get(`/admin/v1/cycle-runs?limit=1&cursor=${first.body.data.nextCursor as string}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.data.items[0].id).not.toBe(latest?.id);
    expect(Date.parse(second.body.data.items[0].startedAt as string)).toBeLessThanOrEqual(
      Date.parse(latest!.startedAt),
    );
  });

  it('valida el cursor y exige un rol que vea el ciclo', async () => {
    // Los tokens primero: armar la petición y esperar otra en el medio confunde a supertest.
    const finance = await staff(['finance']);
    const admin = await staff(['admin']);
    await http()
      .get('/admin/v1/cycle-runs?cursor=basura')
      .set('Authorization', `Bearer ${finance}`)
      .expect(400);
    await http().get('/admin/v1/cycle-runs').set('Authorization', `Bearer ${admin}`).expect(403);
    await http().get('/admin/v1/cycle-runs').expect(401);
  });
});
