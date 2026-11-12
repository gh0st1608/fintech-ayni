import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { normalizeDni } from '@/domain/documents/IdentityVerification';
import { AppError } from '@/domain/shared/errors/AppError';
import {
  FakeWebAuthSession,
  IdentityVerificationApiRepository,
  InMemoryIdentityVerificationRepository,
} from '@/infrastructure/documents/IdentityVerificationAdapters';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { DocumentsScreen } from './screens/DocumentsScreen';
import { IdentityVerificationScreen } from './screens/IdentityVerificationScreen';

function setup() {
  const identityVerification = new InMemoryIdentityVerificationRepository(0);
  const webAuthSession = new FakeWebAuthSession();
  return {
    identityVerification,
    webAuthSession,
    container: createTestContainer({ identityVerification, webAuthSession }),
  };
}

async function renderScreen(container = setup().container, handlers = {}) {
  const props = {
    onManualUpload: jest.fn(),
    onCompleteProfile: jest.fn(),
    onDone: jest.fn(),
    ...handlers,
  };
  await renderWithProviders(<IdentityVerificationScreen {...props} />, container);
  return props;
}

async function startWith(dni: string, consent = true) {
  await fireEvent.changeText(await screen.findByTestId('identity-dni'), dni);
  if (consent) await fireEvent.press(screen.getByTestId('identity-consent'));
  await fireEvent.press(screen.getByTestId('identity-start'));
}

describe('normalizeDni', () => {
  it('acepta 8 dígitos con espacios y rechaza el resto', () => {
    expect(normalizeDni(' 4567 8912 ')).toBe('45678912');
    expect(() => normalizeDni('1234')).toThrow();
  });
});

describe('IdentityVerificationScreen (COPAYNI-92)', () => {
  it('con consentimiento y DNI abre VerificaID y, al volver, muestra la identidad verificada', async () => {
    const { container, webAuthSession } = setup();
    const { onDone } = await renderScreen(container);

    await startWith('45678912');
    expect(await screen.findByText('Identidad verificada')).toBeTruthy();
    expect(screen.getByText('Tu DNI •••••912 quedó verificado.')).toBeTruthy();
    expect(webAuthSession.opened).toEqual(['https://kyc.simulated.ayni/session/dev']);
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('exige el consentimiento y un DNI de 8 dígitos sin llamar al backend', async () => {
    const { container, identityVerification } = setup();
    const start = jest.spyOn(identityVerification, 'start');
    await renderScreen(container);

    await startWith('45678912', false);
    expect(await screen.findByTestId('identity-error')).toHaveTextContent(/Acepta el tratamiento/);
    await fireEvent.press(screen.getByTestId('identity-consent'));
    await fireEvent.changeText(screen.getByTestId('identity-dni'), '1234');
    await fireEvent.press(screen.getByTestId('identity-start'));
    expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it('un rechazo muestra el motivo y permite reintentar', async () => {
    await renderScreen();
    await startWith('11111111');
    expect(await screen.findByTestId('identity-rejected')).toHaveTextContent(
      /no coinciden con tu nombre/,
    );
    expect(screen.getByTestId('identity-start')).toBeTruthy();
  });

  it('agotados los intentos, lleva a subir el DNI manualmente', async () => {
    const { container, identityVerification } = setup();
    identityVerification.attempts = 3;
    const { onManualUpload } = await renderScreen(container);
    await startWith('45678912');
    expect(await screen.findByTestId('identity-error')).toHaveTextContent(/Superaste los intentos/);
    await fireEvent.press(screen.getByRole('button', { name: 'Subir mi DNI' }));
    expect(onManualUpload).toHaveBeenCalled();
  });

  it('con el perfil incompleto, lleva a completar los datos', async () => {
    const { container, identityVerification } = setup();
    jest.spyOn(identityVerification, 'start').mockRejectedValue(
      new AppError('business', 'Incomplete', {
        code: 'IDENTITY_PROFILE_INCOMPLETE',
        fieldErrors: { firstName: 'required' },
      }),
    );
    const { onCompleteProfile } = await renderScreen(container);
    await startWith('45678912');
    await fireEvent.press(await screen.findByRole('button', { name: 'Completar mis datos' }));
    expect(onCompleteProfile).toHaveBeenCalled();
  });

  it('si cierra VerificaID sin terminar, puede continuar la verificación en curso', async () => {
    const { container, identityVerification, webAuthSession } = setup();
    identityVerification.current = {
      ...identityVerification.current,
      status: 'inProgress',
      verificationUrl: 'https://kyc.simulated.ayni/session/dev',
    };
    // El get del fake aprueba al consultar: aquí se simula que sigue en curso.
    jest.spyOn(identityVerification, 'get').mockResolvedValueOnce({
      ...identityVerification.current,
    });
    await renderScreen(container);
    expect(await screen.findByText('Termina tu verificación')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('identity-resume'));
    expect(await screen.findByText('Identidad verificada')).toBeTruthy();
    expect(webAuthSession.opened).toHaveLength(1);
  });
});

describe('DocumentsScreen: verificación con selfie', () => {
  it('ofrece la verificación con su estado y la abre', async () => {
    const onVerifyIdentity = jest.fn();
    await renderWithProviders(
      <DocumentsScreen onOpen={{}} onVerifyIdentity={onVerifyIdentity} />,
      setup().container,
    );
    const row = await screen.findByTestId('document-identity');
    expect(row).toHaveTextContent(/Verificación con selfie.*Pendiente/);
    await fireEvent.press(row);
    expect(onVerifyIdentity).toHaveBeenCalled();
  });
});

describe('IdentityVerificationApiRepository', () => {
  function api(body: unknown) {
    const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const http = new FetchHttpClient({
      baseUrl: 'https://api.test/v1',
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return { fetchImpl, repository: new IdentityVerificationApiRepository(http) };
  }

  const dto = {
    status: 'in_progress',
    consentVersion: '2026-11',
    documentNumber: '•••••912',
    reason: null,
    verificationUrl: 'https://verify.verifica.id/session/abc',
    decidedAt: null,
  };

  it('mapea el estado y envía el DNI con la versión del consentimiento', async () => {
    const { fetchImpl, repository } = api(dto);
    await expect(
      repository.start({ documentNumber: '45678912', consentVersion: '2026-11' }),
    ).resolves.toMatchObject({ status: 'inProgress', documentNumber: '•••••912' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.test/v1/me/identity-verification');
    expect(JSON.parse(init?.body as string)).toEqual({
      documentNumber: '45678912',
      consentVersion: '2026-11',
    });
  });

  it('rechaza un enlace que no es https y mapea los motivos', async () => {
    await expect(
      api({ ...dto, verificationUrl: 'javascript:alert(1)' }).repository.get(),
    ).rejects.toBeDefined();
    await waitFor(async () =>
      expect(
        await api({
          ...dto,
          status: 'rejected',
          reason: 'document_in_use',
          verificationUrl: null,
          decidedAt: '2026-11-12T15:00:00.000Z',
        }).repository.get(),
      ).toMatchObject({ status: 'rejected', reason: 'documentInUse' }),
    );
  });
});
