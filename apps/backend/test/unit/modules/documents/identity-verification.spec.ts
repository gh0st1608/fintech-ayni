import { Logger } from '@nestjs/common';

import {
  type BiometricSession,
  type IdentityProviderPort,
  type IdentitySettings,
  type IdentityVerification,
  type IdentityVerificationRepositoryPort,
  type NewIdentityVerification,
} from '@src/modules/documents/application/identity-verification.ports';
import {
  GetIdentityVerificationUseCase,
  HandleIdentityWebhookUseCase,
  RefreshIdentityVerificationUseCase,
  StartIdentityVerificationUseCase,
} from '@src/modules/documents/application/identity-verification.use-cases';
import {
  type BiometricStatus,
  COUNTED_REJECTIONS,
  decisionOf,
  type DocumentCheck,
  IdentityAlreadyVerifiedError,
  IdentityAttemptsExceededError,
  IdentityConsentOutdatedError,
  IdentityProfileIncompleteError,
  IdentityVerificationInReviewError,
  IdentityVerificationUnavailableError,
  maskDocument,
  namesMatch,
} from '@src/modules/documents/domain/identity-verification';
import {
  SimulatedIdentityProvider,
  UnavailableIdentityProvider,
} from '@src/modules/documents/infrastructure/simulated-identity-provider';
import { VerificaIdIdentityProvider } from '@src/modules/documents/infrastructure/verificaid/verificaid-identity-provider';
import { IdentityVerificationResponse } from '@src/modules/documents/presentation/identity-verification.dto';
import { InfrastructureError, ValidationError } from '@src/shared/errors/app-error';

const NOW = new Date('2026-11-11T15:00:00Z');
const ANA = { userId: 'u-1' };
const DNI = '45678912';
const SETTINGS: IdentitySettings = {
  consentVersion: '2026-11',
  callbackUrl: 'ayni://identity-verification',
  maxRejectedAttempts: 3,
  sessionTtlHours: 24,
};
const RECORD = {
  names: 'JUANA MARIA',
  fathersLastName: 'TORRES',
  mothersLastName: 'RAMIREZ',
};

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
});

describe('Validación documental: nombres del perfil contra RENIEC', () => {
  it.each([
    ['Juana', 'Torres'],
    ['juana maría', 'Torres Ramírez'],
    ['JUANA MARIA', 'torres-ramirez'],
    ['María', 'Torres'],
  ])('%s %s coincide', (firstName, lastName) => {
    expect(namesMatch({ firstName, lastName }, RECORD)).toBe(true);
  });

  it.each([
    ['Juana', 'Ramírez'],
    ['Juan', 'Torres'],
    ['Juana', 'Torres Pérez'],
    ['', 'Torres'],
    ['Juana', '   '],
  ])('%s %s no coincide', (firstName, lastName) => {
    expect(namesMatch({ firstName, lastName }, RECORD)).toBe(false);
  });

  it('la ñ y las tildes se comparan sin distinguir', () => {
    expect(
      namesMatch(
        { firstName: 'Ñusta', lastName: 'Peña' },
        { names: 'ÑUSTA', fathersLastName: 'PEÑA', mothersLastName: '' },
      ),
    ).toBe(true);
  });
});

describe('Decisión según la sesión biométrica', () => {
  it.each<[BiometricStatus, string, string | null]>([
    ['open', 'in_progress', null],
    ['in_review', 'in_review', null],
    ['approved', 'approved', null],
    ['declined', 'rejected', 'biometric_declined'],
    ['expired', 'rejected', 'session_expired'],
    ['document_expired', 'rejected', 'document_expired'],
    ['abandoned', 'rejected', 'abandoned'],
    ['error', 'rejected', 'provider_error'],
  ])('%s → %s', (status, expected, reason) => {
    expect(decisionOf(status)).toEqual({ status: expected, reason });
  });

  it('el DNI sale enmascarado', () => {
    expect(maskDocument(DNI)).toBe('•••••912');
  });
});

/** Repositorio en memoria con las mismas reglas que el de PostgreSQL. */
class InMemoryVerifications implements IdentityVerificationRepositoryPort {
  readonly items: IdentityVerification[] = [];
  subjectOf: { email: string | null; firstName: string | null; lastName: string | null } | null = {
    email: 'ana@mail.com',
    firstName: 'Juana',
    lastName: 'Torres',
  };
  approvedElsewhere = false;

  subject() {
    return Promise.resolve(this.subjectOf);
  }

  latest(userId: string) {
    return Promise.resolve(this.items.filter((item) => item.userId === userId).at(-1) ?? null);
  }

  countedRejections(userId: string) {
    return Promise.resolve(
      this.items.filter(
        (item) =>
          item.userId === userId &&
          item.status === 'rejected' &&
          (COUNTED_REJECTIONS as readonly string[]).includes(item.reason!),
      ).length,
    );
  }

  verifiedByOther() {
    return Promise.resolve(this.approvedElsewhere);
  }

  create(verification: NewIdentityVerification) {
    const created: IdentityVerification = {
      id: verification.id,
      userId: verification.userId,
      documentNumber: verification.documentNumber,
      status: verification.decision.status,
      reason: verification.decision.reason,
      documentCheck: verification.documentCheck,
      providerSessionId: verification.providerSessionId,
      verificationUrl: verification.verificationUrl,
      createdAt: NOW,
      decidedAt: verification.decision.status === 'in_progress' ? null : NOW,
    };
    this.items.push(created);
    return Promise.resolve(created);
  }

  findBySession(sessionId: string) {
    return Promise.resolve(this.items.find((item) => item.providerSessionId === sessionId) ?? null);
  }

  decide(id: string, decision: { status: IdentityVerification['status']; reason: never }) {
    const item = this.items.find((candidate) => candidate.id === id)!;
    if (item.status === 'in_progress' || item.status === 'in_review') {
      Object.assign(item, decision, {
        decidedAt: decision.status === 'in_review' ? null : NOW,
      });
    }
    return Promise.resolve(item);
  }
}

type Port = IdentityProviderPort;

function fakeProvider(
  overrides: { check?: DocumentCheck; status?: BiometricStatus | null } = {},
): jest.Mocked<IdentityProviderPort> {
  return {
    checkDocument: jest.fn<ReturnType<Port['checkDocument']>, Parameters<Port['checkDocument']>>(
      () => Promise.resolve(overrides.check ?? 'matched'),
    ),
    startBiometricSession: jest.fn(
      (props: Parameters<Port['startBiometricSession']>[0]): Promise<BiometricSession> =>
        Promise.resolve({
          sessionId: `s-${props.reference}`,
          url: 'https://bkyc.verifica.id/es/session/abc',
          status: 'open',
        }),
    ),
    biometricStatus: jest.fn<
      ReturnType<Port['biometricStatus']>,
      Parameters<Port['biometricStatus']>
    >(() => Promise.resolve(overrides.status === undefined ? 'open' : overrides.status)),
  };
}

function setup(provider = fakeProvider(), now = NOW) {
  const verifications = new InMemoryVerifications();
  const clock = { now: () => now };
  const refresh = new RefreshIdentityVerificationUseCase(verifications, provider, SETTINGS, clock);
  return {
    verifications,
    provider,
    start: new StartIdentityVerificationUseCase(verifications, provider, SETTINGS, refresh),
    get: new GetIdentityVerificationUseCase(verifications, refresh),
    webhook: new HandleIdentityWebhookUseCase(verifications, refresh),
  };
}
const command = (documentNumber = DNI) => ({ documentNumber, consentVersion: '2026-11' });

describe('Iniciar la verificación de identidad (COPAYNI-42)', () => {
  it('con el DNI y los nombres correctos abre la sesión biométrica (CheckMatch)', async () => {
    const { start, provider } = setup();
    const verification = await start.execute(ANA, command());
    expect(provider.checkDocument).toHaveBeenCalledWith({
      documentNumber: DNI,
      firstName: 'Juana',
      lastName: 'Torres',
    });
    expect(provider.startBiometricSession).toHaveBeenCalledWith({
      reference: verification.id,
      email: 'ana@mail.com',
      callbackUrl: SETTINGS.callbackUrl,
    });
    expect(verification).toMatchObject({
      status: 'in_progress',
      documentCheck: 'matched',
      verificationUrl: 'https://bkyc.verifica.id/es/session/abc',
    });
  });

  it.each<[DocumentCheck, string]>([
    ['not_found', 'document_not_found'],
    ['mismatch', 'data_mismatch'],
  ])('si la Consulta da %s, rechaza sin pagar un CheckMatch', async (check, reason) => {
    const { start, provider } = setup(fakeProvider({ check }));
    const verification = await start.execute(ANA, command());
    expect(verification).toMatchObject({ status: 'rejected', reason, documentCheck: check });
    expect(provider.startBiometricSession).not.toHaveBeenCalled();
  });

  it('un DNI aprobado en otra cuenta se rechaza sin consultar al proveedor', async () => {
    const { start, verifications, provider } = setup();
    verifications.approvedElsewhere = true;
    expect(await start.execute(ANA, command())).toMatchObject({
      status: 'rejected',
      reason: 'document_in_use',
    });
    expect(provider.checkDocument).not.toHaveBeenCalled();
  });

  it('reutiliza la sesión abierta con el mismo DNI y abandona la de otro DNI', async () => {
    const { start, verifications, provider } = setup();
    const first = await start.execute(ANA, command());
    expect(await start.execute(ANA, command())).toBe(first);
    expect(provider.startBiometricSession).toHaveBeenCalledTimes(1);
    const other = await start.execute(ANA, command('87654321'));
    expect(other.id).not.toBe(first.id);
    expect(verifications.items[0]).toMatchObject({ status: 'rejected', reason: 'abandoned' });
  });

  it('valida el consentimiento, el DNI y el perfil', async () => {
    const { start, verifications } = setup();
    await expect(
      start.execute(ANA, { documentNumber: DNI, consentVersion: '2025-01' }),
    ).rejects.toBeInstanceOf(IdentityConsentOutdatedError);
    await expect(start.execute(ANA, command('1234567'))).rejects.toBeInstanceOf(ValidationError);
    verifications.subjectOf = { email: null, firstName: 'Juana', lastName: ' ' };
    await expect(start.execute(ANA, command())).rejects.toMatchObject({
      code: 'IDENTITY_PROFILE_INCOMPLETE',
      details: { email: 'required', lastName: 'required' },
    });
    await expect(start.execute(ANA, command())).rejects.toBeInstanceOf(
      IdentityProfileIncompleteError,
    );
  });

  it('ya verificada o en revisión no se vuelve a empezar', async () => {
    const approved = setup(fakeProvider({ status: 'approved' }));
    await approved.start.execute(ANA, command());
    await expect(approved.start.execute(ANA, command())).rejects.toBeInstanceOf(
      IdentityAlreadyVerifiedError,
    );
    const inReview = setup(fakeProvider({ status: 'in_review' }));
    await inReview.start.execute(ANA, command());
    await expect(inReview.start.execute(ANA, command())).rejects.toBeInstanceOf(
      IdentityVerificationInReviewError,
    );
  });

  it('tras 3 rechazos atribuibles a la persona pasa a revisión manual', async () => {
    const { start } = setup(fakeProvider({ check: 'mismatch' }));
    for (let attempt = 0; attempt < 3; attempt += 1) await start.execute(ANA, command());
    await expect(start.execute(ANA, command())).rejects.toBeInstanceOf(
      IdentityAttemptsExceededError,
    );
  });

  it('una sesión vencida o abandonada no cuenta como intento', async () => {
    const { start, verifications } = setup(fakeProvider({ status: 'expired' }));
    for (let attempt = 0; attempt < 4; attempt += 1) await start.execute(ANA, command());
    expect(verifications.items.filter((item) => item.reason === 'session_expired')).toHaveLength(3);
  });
});

describe('Resultado de la sesión biométrica', () => {
  it('al volver a la app se consulta al proveedor y queda aprobada', async () => {
    const provider = fakeProvider();
    const { start, get } = setup(provider);
    const started = await start.execute(ANA, command());
    provider.biometricStatus.mockResolvedValue('approved');
    expect(await get.execute(ANA)).toMatchObject({ id: started.id, status: 'approved' });
    expect(provider.biometricStatus).toHaveBeenCalledWith({
      sessionId: started.providerSessionId,
      documentNumber: DNI,
    });
  });

  it('el webhook solo identifica la sesión: el estado se consulta al proveedor', async () => {
    const provider = fakeProvider();
    const { start, webhook, verifications } = setup(provider);
    const started = await start.execute(ANA, command());
    provider.biometricStatus.mockResolvedValue('declined');
    await webhook.execute(started.providerSessionId!);
    expect(verifications.items[0]).toMatchObject({
      status: 'rejected',
      reason: 'biometric_declined',
    });
    await webhook.execute('sesion-ajena');
    expect(provider.biometricStatus).toHaveBeenCalledTimes(1);
  });

  it('sin resultado pasado el plazo, la sesión vence', async () => {
    const provider = fakeProvider({ status: null });
    const { start, verifications } = setup(provider);
    await start.execute(ANA, command());
    const later = new RefreshIdentityVerificationUseCase(verifications, provider, SETTINGS, {
      now: () => new Date(NOW.getTime() + 25 * 3600 * 1000),
    });
    expect(await later.execute(verifications.items[0]!)).toMatchObject({
      status: 'rejected',
      reason: 'session_expired',
    });
  });

  it('sin verificación, el GET responde not_started con la versión del consentimiento', async () => {
    const { get } = setup();
    expect(IdentityVerificationResponse.from(await get.execute(ANA), '2026-11')).toMatchObject({
      status: 'not_started',
      consentVersion: '2026-11',
      verificationUrl: null,
    });
  });

  it('la respuesta nunca trae el DNI completo ni el enlace de una sesión cerrada', async () => {
    const provider = fakeProvider();
    const { start, get } = setup(provider);
    await start.execute(ANA, command());
    provider.biometricStatus.mockResolvedValue('declined');
    const response = IdentityVerificationResponse.from(await get.execute(ANA), '2026-11');
    expect(response).toMatchObject({
      status: 'rejected',
      documentNumber: '•••••912',
      reason: 'biometric_declined',
      message: expect.stringContaining('rostro'),
      verificationUrl: null,
    });
  });
});

describe('Proveedores simulado y sin proveedor', () => {
  it('el simulado rechaza los DNI de prueba y resuelve con el resultado configurado', async () => {
    const provider = new SimulatedIdentityProvider('rejected');
    const names = { firstName: 'A', lastName: 'B' };
    expect(await provider.checkDocument({ documentNumber: '00000000', ...names })).toBe(
      'not_found',
    );
    expect(await provider.checkDocument({ documentNumber: '11111111', ...names })).toBe('mismatch');
    expect(await provider.checkDocument({ documentNumber: DNI, ...names })).toBe('matched');
    expect(await provider.biometricStatus()).toBe('declined');
  });

  it('con KYC_PROVIDER=manual la verificación en línea no está disponible', async () => {
    const { start } = setup(new UnavailableIdentityProvider() as never);
    await expect(start.execute(ANA, command())).rejects.toBeInstanceOf(
      IdentityVerificationUnavailableError,
    );
  });
});

describe('Adaptador de VerificaID', () => {
  const VERIFICAID = { apiUrl: 'https://api.test', apiToken: 'token-secreto', timeoutMs: 1000 };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  function adapter(...responses: Response[]) {
    const http = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    for (const response of responses) http.mockResolvedValueOnce(response);
    return { http, verificaId: new VerificaIdIdentityProvider(VERIFICAID, http) };
  }
  const callOf = (http: jest.Mock, index = 0) => {
    const [url, init] = http.mock.calls[index] as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };
  const PERSON = {
    type: 'result',
    status: 200,
    message: 'Se ha validado la información correctamente.',
    data: {
      dni: DNI,
      nombres: 'JUANA MARIA',
      apellido_paterno: 'TORRES',
      apellido_materno: 'RAMIREZ',
      caracter_verificacion: '9',
      caracter_verificacion_anterior: null,
    },
  };

  it('Consulta: envía el DNI como form-data con el token y compara los nombres', async () => {
    const { http, verificaId } = adapter(json(PERSON), json(PERSON));
    expect(
      await verificaId.checkDocument({
        documentNumber: DNI,
        firstName: 'Juana',
        lastName: 'Torres',
      }),
    ).toBe('matched');
    const call = callOf(http);
    expect(call.url).toBe('https://api.test/v2/consulta/personas');
    expect(call.init.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer token-secreto');
    expect((call.init.body as FormData).get('dni')).toBe(DNI);
    expect(
      await verificaId.checkDocument({
        documentNumber: DNI,
        firstName: 'Pedro',
        lastName: 'Torres',
      }),
    ).toBe('mismatch');
  });

  it('Consulta: un DNI inexistente es not_found', async () => {
    const { verificaId } = adapter(json({ type: 'not_found' }, 404), json({ data: null }));
    const props = { documentNumber: DNI, firstName: 'Juana', lastName: 'Torres' };
    expect(await verificaId.checkDocument(props)).toBe('not_found');
    expect(await verificaId.checkDocument(props)).toBe('not_found');
  });

  it('CheckMatch: abre la sesión de KYC Bravo con los parámetros en la query', async () => {
    const { http, verificaId } = adapter(
      json({
        status: 'success',
        message: 'Session created.',
        data: {
          id: 'aa62043c-0000',
          status: 'not_started',
          url: 'https://bkyc.verifica.id/es/session/iahMkegZu-hu',
          features: [{ feature: 'LIVENESS', status: 'not_started' }],
        },
      }),
    );
    expect(
      await verificaId.startBiometricSession({
        reference: 'v-1',
        email: 'ana@mail.com',
        callbackUrl: 'ayni://identity-verification',
      }),
    ).toEqual({
      sessionId: 'aa62043c-0000',
      url: 'https://bkyc.verifica.id/es/session/iahMkegZu-hu',
      status: 'open',
    });
    const url = new URL(callOf(http).url);
    expect(url.pathname).toBe('/api/v1/solutions/kyc-bravo/session');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      email: 'ana@mail.com',
      vendor_id: 'v-1',
      callback_url: 'ayni://identity-verification',
    });
  });

  it('Resultado: solo cuenta la última sesión del DNI si es la nuestra', async () => {
    const last = (sessionId: string, status: string) =>
      json({ status: 'success', data: { session_id: sessionId, status, url: null } });
    const { http, verificaId } = adapter(
      last('s-1', 'approved'),
      last('s-1', 'kyc_expired'),
      last('s-otra', 'approved'),
      json({ status: 'success', message: 'No previous session found.', data: null }),
      last('s-1', 'algo_nuevo'),
    );
    const props = { sessionId: 's-1', documentNumber: DNI };
    expect(await verificaId.biometricStatus(props)).toBe('approved');
    expect(JSON.parse(callOf(http).init.body as string)).toEqual({
      document_type: 'dni',
      document_number: DNI,
    });
    expect(callOf(http).url).toBe('https://api.test/api/v1/solutions/kyc-bravo/sessions/last');
    expect(await verificaId.biometricStatus(props)).toBe('document_expired');
    expect(await verificaId.biometricStatus(props)).toBeNull();
    expect(await verificaId.biometricStatus(props)).toBeNull();
    expect(await verificaId.biometricStatus(props)).toBe('open');
  });

  it('cuota agotada, error o sin red: 503 genérico, sin el cuerpo ni el token en el log', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { http, verificaId } = adapter(json({ message: 'DNI 45678912' }, 429));
    http.mockRejectedValueOnce(
      Object.assign(new Error('https://api.test'), { name: 'TimeoutError' }),
    );
    const props = { sessionId: 's-1', documentNumber: DNI };
    await expect(verificaId.biometricStatus(props)).rejects.toBeInstanceOf(InfrastructureError);
    await expect(verificaId.biometricStatus(props)).rejects.toThrow(
      'VerificaID no respondió: TimeoutError',
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(DNI);
    expect(logged).not.toContain('token-secreto');
  });
});
