import { Logger } from '@nestjs/common';

import {
  ExpireAgreementsUseCase,
  ListAgreementsUseCase,
  ReadAgreementDocumentUseCase,
  RequestSignatureCodeUseCase,
  SignAgreementUseCase,
  OpenAgreementsUseCase,
} from '@src/modules/agreements/application/agreements.use-cases';
import {
  type AgreementRepositoryPort,
  type AgreementSettings,
  type ExpiredMembership,
  type NewAgreement,
  type SignatureChallengeRepositoryPort,
  type SignatureEvidence,
} from '@src/modules/agreements/application/ports';
import {
  type AgreementDocument,
  type MembershipAgreement,
} from '@src/modules/agreements/domain/agreement';
import { type SignatureChallenge } from '@src/modules/agreements/domain/signature-challenge';
import { type AgreementData, hashOf } from '@src/modules/agreements/domain/templates';
import { type AuthPolicy } from '@src/modules/auth/application/ports/auth.ports';
import { Money } from '@src/shared/domain/value-objects/money';
import { TestClock } from '@test/support/create-test-app';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const at = (iso: string) => new Date(iso);

/** Los diez meses del círculo de prueba, para el calendario del documento. */
const MONTHS = [
  '2026-12',
  '2027-01',
  '2027-02',
  '2027-03',
  '2027-04',
  '2027-05',
  '2027-06',
  '2027-07',
  '2027-08',
  '2027-09',
];

const DATA: AgreementData = {
  payout: pen(6_000),
  months: 10,
  position: 3,
  baseInstallment: pen(600),
  totalPaid: pen(6_000),
  retention: pen(1_200),
  startsOn: '2026-12',
  payoutPeriod: '2027-02',
  // Lo que el documento necesita para describir la obligación real (COPAYNI-119).
  cadence: 'monthly' as const,
  turns: 10,
  unit: 'mes',
  startsOnDate: '2026-12-01',
  endsOnDate: '2027-09-01',
  payoutOn: '2027-02-01',
  netPayout: pen(4_800),
  dueDates: MONTHS.map((month, index) => ({ turn: index + 1, dueOn: `${month}-01` })),
  graceDays: 3,
  lateFeeBps: 300,
};

const POLICY: AuthPolicy = {
  otp: { codeTtlSeconds: 300, resendCooldownSeconds: 30, maxAttempts: 3, maxResends: 2 },
  startMaxPerWindow: 5,
  startWindowSeconds: 900,
  refreshTokenTtlDays: 30,
};

/** Repositorio en memoria con las mismas garantías que el SQL en lo que importa a las reglas. */
class InMemoryAgreements implements AgreementRepositoryPort {
  readonly rows = new Map<string, MembershipAgreement>();
  readonly evidence = new Map<string, SignatureEvidence>();

  create(agreement: NewAgreement): Promise<void> {
    this.rows.set(agreement.id, {
      id: agreement.id,
      userId: agreement.userId,
      circleId: agreement.circleId,
      position: agreement.position,
      contract: {
        version: agreement.contractVersion,
        text: agreement.contractText,
        hash: agreement.contractHash,
        readAt: null,
      },
      promissoryNote: {
        version: agreement.promissoryNoteVersion,
        text: agreement.promissoryNoteText,
        hash: agreement.promissoryNoteHash,
        readAt: null,
      },
      status: 'pending',
      createdAt: agreement.createdAt,
      expiresAt: agreement.expiresAt,
      signedAt: null,
    });
    return Promise.resolve();
  }

  byId(id: string): Promise<MembershipAgreement | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  listFor(userId: string): Promise<MembershipAgreement[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.userId === userId));
  }

  find(userId: string, circleId: string): Promise<MembershipAgreement | null> {
    const found = [...this.rows.values()].find(
      (row) => row.userId === userId && row.circleId === circleId,
    );
    return Promise.resolve(found ?? null);
  }

  hasUnsigned(userId: string): Promise<boolean> {
    const rows = [...this.rows.values()].filter((row) => row.userId === userId);
    return Promise.resolve(rows.some((row) => row.status !== 'signed'));
  }

  markRead(id: string, document: AgreementDocument, now: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve();
    const key = document === 'contract' ? 'contract' : 'promissoryNote';
    if (row[key].readAt === null) {
      this.rows.set(id, { ...row, [key]: { ...row[key], readAt: now } });
    }
    return Promise.resolve();
  }

  sign(id: string, evidence: SignatureEvidence): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== 'pending' || evidence.signedAt >= row.expiresAt) {
      return Promise.resolve(false);
    }
    this.rows.set(id, { ...row, status: 'signed', signedAt: evidence.signedAt });
    // La evidencia es de solo inserción: nunca se sobrescribe.
    if (this.evidence.has(id)) throw new Error('La evidencia ya existe');
    this.evidence.set(id, evidence);
    return Promise.resolve(true);
  }

  expire(now: Date): Promise<ExpiredMembership[]> {
    const expired: ExpiredMembership[] = [];
    for (const [id, row] of this.rows) {
      if (row.status === 'pending' && now >= row.expiresAt) {
        this.rows.set(id, { ...row, status: 'expired' });
        expired.push({
          agreementId: id,
          userId: row.userId,
          circleId: row.circleId,
          position: row.position,
        });
      }
    }
    return Promise.resolve(expired);
  }
}

class InMemoryChallenges implements SignatureChallengeRepositoryPort {
  readonly rows: SignatureChallenge[] = [];

  create(challenge: SignatureChallenge): Promise<void> {
    this.rows.push(challenge);
    return Promise.resolve();
  }

  latestFor(agreementId: string): Promise<SignatureChallenge | null> {
    const found = [...this.rows].reverse().find((row) => row.snapshot.agreementId === agreementId);
    return Promise.resolve(found ?? null);
  }

  update<T>(id: string, change: (challenge: SignatureChallenge) => T): Promise<T | null> {
    const found = this.rows.find((row) => row.snapshot.id === id);
    return Promise.resolve(found ? change(found) : null);
  }
}

/** Hasher trivial, determinista y atado al desafío, como el real. */
const hasher = {
  hash: (challengeId: string, code: string) => `${challengeId}:${code}`,
  matches: (challengeId: string, code: string, codeHash: string) =>
    `${challengeId}:${code}` === codeHash,
};

const SETTINGS: AgreementSettings = { signatureTtlHours: 48 };
const PRINCIPAL = { userId: 'u-1' };

function setup(now = at('2026-11-16T12:00:00Z')) {
  const clock = new TestClock(now);
  const agreements = new InMemoryAgreements();
  const challenges = new InMemoryChallenges();
  const sent: { destination: string; code: string }[] = [];
  const users = {
    findById: () =>
      Promise.resolve({
        loginIdentifier: (channel: string) =>
          channel === 'sms'
            ? { channel: 'sms', value: '+51987654321', masked: () => '+51 ••• ••• 321' }
            : null,
        preferredLanguage: 'es',
      }),
  };
  const open = new OpenAgreementsUseCase(agreements, SETTINGS, clock);
  return {
    clock,
    agreements,
    challenges,
    sent,
    open,
    list: new ListAgreementsUseCase(agreements, clock),
    read: new ReadAgreementDocumentUseCase(agreements, clock),
    requestCode: new RequestSignatureCodeUseCase(
      agreements,
      challenges,
      users as never,
      { generate: () => '1234' },
      hasher,
      {
        send: (message) => {
          sent.push({ destination: message.destination, code: message.code });
          return Promise.resolve();
        },
      },
      POLICY,
      clock,
    ),
    sign: new SignAgreementUseCase(agreements, challenges, hasher, clock),
    expire: new ExpireAgreementsUseCase(agreements, clock),
  };
}

async function openAgreement(fixture: ReturnType<typeof setup>): Promise<string> {
  await fixture.open.execute({ userId: 'u-1', circleId: 'c-1', position: 3, data: DATA });
  return [...fixture.agreements.rows.keys()][0]!;
}

describe('Firma del contrato y del pagaré (COPAYNI-89)', () => {
  beforeEach(() => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('al unirse se abren los dos documentos, pendientes y con 48 h de plazo', async () => {
    const fixture = setup();
    const id = await openAgreement(fixture);
    const [view] = await fixture.list.execute(PRINCIPAL);

    expect(view).toMatchObject({ id, circleId: 'c-1', position: 3, status: 'pending' });
    expect(view!.unread).toEqual(['contract', 'promissory_note']);
    // 48 h exactas desde la unión.
    expect(view!.expiresAt.toISOString()).toBe('2026-11-18T12:00:00.000Z');
  });

  it('el texto guardado es el que se firma y su hash coincide', async () => {
    const fixture = setup();
    const id = await openAgreement(fixture);
    const contract = await fixture.read.execute(PRINCIPAL, id, 'contract');

    expect(contract.text).toContain('CONTRATO DE PARTICIPACIÓN');
    // El texto provisional avisa que no lo redactó Legal (pending-scope §3.3).
    expect(contract.text).toContain('TEXTO PROVISIONAL');
    expect(contract.text).toContain('Cuota base mensual: 600.00 PEN');
    expect(contract.text).toContain('Monto del pozo a recibir: 6000.00 PEN');
    expect(hashOf(contract.text)).toBe(contract.hash);
  });

  it('sin leer los dos documentos no se puede pedir el código', async () => {
    const fixture = setup();
    const id = await openAgreement(fixture);

    await expect(fixture.requestCode.execute(PRINCIPAL, id)).rejects.toMatchObject({
      code: 'AGREEMENT_DOCUMENTS_NOT_READ',
      details: { pending: 'contract,promissory_note' },
    });

    // Con uno solo leído tampoco: faltan los dos.
    await fixture.read.execute(PRINCIPAL, id, 'contract');
    await expect(fixture.requestCode.execute(PRINCIPAL, id)).rejects.toMatchObject({
      code: 'AGREEMENT_DOCUMENTS_NOT_READ',
      details: { pending: 'promissory_note' },
    });

    await fixture.read.execute(PRINCIPAL, id, 'promissory_note');
    await expect(fixture.requestCode.execute(PRINCIPAL, id)).resolves.toMatchObject({
      maskedDestination: '+51 ••• ••• 321',
    });
    expect(fixture.sent).toEqual([{ destination: '+51987654321', code: '1234' }]);
  });

  async function readable(fixture: ReturnType<typeof setup>): Promise<string> {
    const id = await openAgreement(fixture);
    await fixture.read.execute(PRINCIPAL, id, 'contract');
    await fixture.read.execute(PRINCIPAL, id, 'promissory_note');
    return id;
  }

  it('un código correcto firma los dos documentos y guarda la evidencia', async () => {
    const fixture = setup();
    const id = await readable(fixture);
    await fixture.requestCode.execute(PRINCIPAL, id);

    const signed = await fixture.sign.execute(PRINCIPAL, id, {
      code: '1234',
      ip: '200.1.2.3',
      userAgent: 'Ayni/1.0 iOS',
    });

    expect(signed.status).toBe('signed');
    const agreement = fixture.agreements.rows.get(id)!;
    expect(agreement.status).toBe('signed');
    // La evidencia congela los hashes de lo que se firmó, con IP y dispositivo.
    expect(fixture.agreements.evidence.get(id)).toMatchObject({
      ip: '200.1.2.3',
      userAgent: 'Ayni/1.0 iOS',
      contractHash: agreement.contract.hash,
      promissoryNoteHash: agreement.promissoryNote.hash,
    });
    await expect(fixture.agreements.hasUnsigned('u-1')).resolves.toBe(false);
  });

  it('un código incorrecto no firma, descuenta intentos y agota al tercero', async () => {
    const fixture = setup();
    const id = await readable(fixture);
    await fixture.requestCode.execute(PRINCIPAL, id);
    const wrong = { code: '9999', ip: null, userAgent: null };

    await expect(fixture.sign.execute(PRINCIPAL, id, wrong)).rejects.toMatchObject({
      code: 'SIGNATURE_CODE_INVALID',
      details: { attemptsRemaining: '2' },
    });
    await expect(fixture.sign.execute(PRINCIPAL, id, wrong)).rejects.toMatchObject({
      details: { attemptsRemaining: '1' },
    });
    await expect(fixture.sign.execute(PRINCIPAL, id, wrong)).rejects.toMatchObject({
      code: 'SIGNATURE_ATTEMPTS_EXCEEDED',
    });
    expect(fixture.agreements.rows.get(id)!.status).toBe('pending');
    expect(fixture.agreements.evidence.has(id)).toBe(false);
  });

  it('un código vencido no firma y se puede pedir otro', async () => {
    const fixture = setup();
    const id = await readable(fixture);
    await fixture.requestCode.execute(PRINCIPAL, id);

    // El código vive 300 s; a los 6 minutos ya no sirve, pero el acuerdo sigue vigente.
    fixture.clock.set(at('2026-11-16T12:06:00Z'));
    await expect(
      fixture.sign.execute(PRINCIPAL, id, { code: '1234', ip: null, userAgent: null }),
    ).rejects.toMatchObject({ code: 'SIGNATURE_CODE_EXPIRED' });

    await expect(fixture.requestCode.execute(PRINCIPAL, id)).resolves.toBeDefined();
    await expect(
      fixture.sign.execute(PRINCIPAL, id, { code: '1234', ip: null, userAgent: null }),
    ).resolves.toMatchObject({ status: 'signed' });
  });

  it('pasado el plazo de 48 h no se firma y el acuerdo queda vencido', async () => {
    const fixture = setup();
    const id = await readable(fixture);
    await fixture.requestCode.execute(PRINCIPAL, id);

    fixture.clock.set(at('2026-11-18T12:00:01Z'));
    await expect(
      fixture.sign.execute(PRINCIPAL, id, { code: '1234', ip: null, userAgent: null }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_NOT_PENDING', details: { status: 'expired' } });
    // Tampoco se puede pedir un código nuevo.
    await expect(fixture.requestCode.execute(PRINCIPAL, id)).rejects.toMatchObject({
      code: 'AGREEMENT_NOT_PENDING',
    });

    // La tarea diaria lo marca y devuelve la membresía cuyo turno hay que liberar.
    await expect(fixture.expire.execute()).resolves.toEqual([
      { agreementId: id, userId: 'u-1', circleId: 'c-1', position: 3 },
    ]);
    expect(fixture.agreements.rows.get(id)!.status).toBe('expired');
    // Idempotente: no vuelve a salir.
    await expect(fixture.expire.execute()).resolves.toEqual([]);
  });

  it('firmado, no se vuelve a firmar ni vence', async () => {
    const fixture = setup();
    const id = await readable(fixture);
    await fixture.requestCode.execute(PRINCIPAL, id);
    await fixture.sign.execute(PRINCIPAL, id, { code: '1234', ip: null, userAgent: null });

    fixture.clock.set(at('2026-11-20T12:00:00Z'));
    await expect(fixture.expire.execute()).resolves.toEqual([]);
    const [view] = await fixture.list.execute(PRINCIPAL);
    expect(view!.status).toBe('signed');
  });

  it('un acuerdo de otra persona no existe', async () => {
    const fixture = setup();
    const id = await openAgreement(fixture);
    await expect(fixture.read.execute({ userId: 'otra' }, id, 'contract')).rejects.toMatchObject({
      code: 'AGREEMENT_NOT_FOUND',
    });
  });
});
