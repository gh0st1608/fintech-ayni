import { QueryFailedError, type DataSource } from 'typeorm';

import { SqlIdentityVerificationsRepository } from '@src/modules/documents/infrastructure/sql-identity-verifications.repository';

/**
 * Ramas del repositorio de verificaciones de identidad sin base de datos: ids que no son uuid,
 * filas ausentes y las violaciones de unicidad que resuelven las carreras (COPAYNI-42).
 */
const USER = '0b6f4d2e-6c1a-4e0b-9a51-2d3c4b5a6f70';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'v-1',
  user_id: USER,
  document_number: '12345678',
  status: 'in_progress',
  reason: null,
  document_check: 'matched',
  provider_session_id: 'ses-1',
  verification_url: 'https://verifica.id/ses-1',
  created_at: '2026-11-01T10:00:00Z',
  decided_at: null,
  ...overrides,
});

const uniqueViolation = (constraint: string) =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('duplicate'), { code: '23505', constraint }),
  );

function repository(...responses: (unknown[] | Error)[]) {
  const query = jest.fn(() => {
    const next = responses.shift() ?? [];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return {
    query,
    repo: new SqlIdentityVerificationsRepository({ query } as unknown as DataSource, 'verificaid'),
  };
}

const NEW = {
  id: 'v-1',
  userId: USER,
  documentNumber: '12345678',
  decision: { status: 'in_progress' as const, reason: null },
  documentCheck: 'matched' as const,
  providerSessionId: 'ses-1',
  verificationUrl: 'https://verifica.id/ses-1',
  consentVersion: '2026-11',
};

describe('SqlIdentityVerificationsRepository', () => {
  it('un id que no es uuid no consulta la base', async () => {
    const { repo, query } = repository();
    await expect(repo.subject('x')).resolves.toBeNull();
    await expect(repo.latest('x')).resolves.toBeNull();
    await expect(repo.countedRejections('x')).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('traduce las filas y responde vacío cuando no existen', async () => {
    const { repo } = repository(
      [{ email: 'ana@mail.com', first_name: 'Ana', last_name: 'Q' }],
      [],
      [row({ decided_at: '2026-11-02T10:00:00Z', status: 'approved' })],
      [],
      [{ count: '2' }],
      [],
      [{}],
      [],
      [row()],
    );
    await expect(repo.subject(USER)).resolves.toEqual({
      email: 'ana@mail.com',
      firstName: 'Ana',
      lastName: 'Q',
    });
    await expect(repo.subject(USER)).resolves.toBeNull();
    await expect(repo.latest(USER)).resolves.toMatchObject({
      status: 'approved',
      decidedAt: new Date('2026-11-02T10:00:00Z'),
    });
    await expect(repo.latest(USER)).resolves.toBeNull();
    await expect(repo.countedRejections(USER)).resolves.toBe(2);
    await expect(repo.countedRejections(USER)).resolves.toBe(0);
    await expect(repo.verifiedByOther(USER, '12345678')).resolves.toBe(true);
    await expect(repo.verifiedByOther(USER, '12345678')).resolves.toBe(false);
    await expect(repo.findBySession('ses-1')).resolves.toMatchObject({ decidedAt: null });
    await expect(repo.findBySession('ses-1')).resolves.toBeNull();
  });

  it('dos inicios a la vez: el segundo recibe la verificación abierta', async () => {
    const { repo } = repository(uniqueViolation('ux_identity_verifications_open'), [
      row({ id: 'v-0' }),
    ]);
    await expect(repo.create(NEW)).resolves.toMatchObject({ id: 'v-0' });
  });

  it('propaga la violación si no encuentra la abierta, u otro error', async () => {
    const open = uniqueViolation('ux_identity_verifications_open');
    const first = repository(open, []);
    await expect(first.repo.create(NEW)).rejects.toBe(open);

    const other = uniqueViolation('otra');
    await expect(repository(other).repo.create(NEW)).rejects.toBe(other);
    const plain = new Error('caída');
    await expect(repository(plain).repo.create(NEW)).rejects.toBe(plain);
  });

  it('crea una verificación ya decidida', async () => {
    const { repo, query } = repository([row({ status: 'rejected', reason: 'data_mismatch' })]);
    await repo.create({ ...NEW, decision: { status: 'rejected', reason: 'data_mismatch' } });
    expect(query.mock.calls[0]).toEqual([expect.any(String), expect.arrayContaining([true])]);
  });

  it('decide: actualiza, o devuelve como quedó si ya estaba resuelta', async () => {
    const { repo } = repository(
      [[row({ status: 'approved' })], 1],
      [[], 0],
      [row({ status: 'rejected', reason: 'expired' })],
    );
    await expect(repo.decide('v-1', { status: 'approved', reason: null })).resolves.toMatchObject({
      status: 'approved',
    });
    await expect(repo.decide('v-1', { status: 'in_review', reason: null })).resolves.toMatchObject({
      status: 'rejected',
    });
  });

  it('un DNI ya aprobado por otra cuenta se rechaza por documento en uso; otro error se propaga', async () => {
    const { repo } = repository(uniqueViolation('ux_identity_verifications_document'), [
      [row({ status: 'rejected', reason: 'document_in_use' })],
      1,
    ]);
    await expect(repo.decide('v-1', { status: 'approved', reason: null })).resolves.toMatchObject({
      reason: 'document_in_use',
    });
    const other = uniqueViolation('otra');
    await expect(
      repository(other).repo.decide('v-1', { status: 'approved', reason: null }),
    ).rejects.toBe(other);
  });
});
