import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { AppError } from '@/domain/shared/errors/AppError';
import { FAKE_OTP_CODE, InMemoryAuthApi } from '@/infrastructure/auth/InMemoryAuthApi';
import { formatCountdown, useCountdown } from '@/presentation/shared/hooks/useCountdown';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { fromChallengeParams, toChallengeParams } from './challengeParams';
import { SignInScreen } from './screens/SignInScreen';
import { VerifyOtpScreen } from './screens/VerifyOtpScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

const IDENTIFIER_LABEL = 'Email/Teléfono';
const INVALID_IDENTIFIER =
  'Ingresa un email válido o un teléfono con código de país (p. ej. +51 987 654 321).';

describe('WelcomeScreen', () => {
  it('muestra la bienvenida con la marca configurada y continúa al ingreso', async () => {
    const onContinue = jest.fn();
    await renderWithProviders(<WelcomeScreen onContinue={onContinue} />);
    expect(screen.getByRole('header', { name: 'Bienvenido a Ayni' })).toBeTruthy();
    expect(screen.queryByText(/modo demo/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(onContinue).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('si la sesión expiró avisa que hay que volver a ingresar', async () => {
    const setup = createTestContainer();
    await renderWithProviders(<WelcomeScreen onContinue={jest.fn()} />, setup);
    await act(() => setup.container.auth.refreshSession.expire());
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró. Vuelve a ingresar.');
  });
});

describe('SignInScreen', () => {
  async function renderSignIn(setup = createTestContainer()) {
    const onChallengeStarted = jest.fn();
    const view = await renderWithProviders(
      <SignInScreen onChallengeStarted={onChallengeStarted} />,
      setup,
    );
    return { ...view, onChallengeStarted };
  }

  it('con un formato inválido muestra el error del campo y no llama a la API', async () => {
    const setup = createTestContainer();
    const spy = jest.spyOn(setup.adapters.authApi, 'startAuthentication');
    await renderSignIn(setup);

    await fireEvent.changeText(screen.getByLabelText(IDENTIFIER_LABEL), '987654321');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_IDENTIFIER);
    expect(spy).not.toHaveBeenCalled();

    // Tras el primer intento, el error se recalcula en vivo.
    await fireEvent.changeText(screen.getByLabelText(IDENTIFIER_LABEL), '+51987654321');
    expect(screen.queryByText(INVALID_IDENTIFIER)).toBeNull();
  });

  it('con un formato válido pide el OTP una sola vez y entrega el desafío', async () => {
    const setup = createTestContainer({ authApi: new InMemoryAuthApi({ latencyMs: 50 }) });
    const spy = jest.spyOn(setup.adapters.authApi, 'startAuthentication');
    const { onChallengeStarted } = await renderSignIn(setup);

    await fireEvent.changeText(screen.getByLabelText(IDENTIFIER_LABEL), 'ana@mail.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent(screen.getByLabelText(IDENTIFIER_LABEL), 'submitEditing');

    await waitFor(() => expect(onChallengeStarted).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onChallengeStarted.mock.calls[0]?.[0]).toMatchObject({
      maskedDestination: 'a***@mail.com',
    });
  });

  it.each([
    [
      new AppError('network', 'offline'),
      'No hay conexión. Revisa tu internet e inténtalo de nuevo.',
    ],
    [
      new AppError('rate_limited', 'slow down', { retryAfterSeconds: 42 }),
      'Demasiados intentos. Vuelve a intentarlo en 42 s.',
    ],
  ])('ante %s muestra un mensaje accionable y conserva lo escrito', async (error, message) => {
    const setup = createTestContainer();
    jest.spyOn(setup.adapters.authApi, 'startAuthentication').mockRejectedValue(error);
    await renderSignIn(setup);

    await fireEvent.changeText(screen.getByLabelText(IDENTIFIER_LABEL), 'ana@mail.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText(IDENTIFIER_LABEL).props.value).toBe('ana@mail.com');
  });

  it('los enlaces legales abren las URLs configuradas', async () => {
    const setup = createTestContainer();
    setup.container.config.legal = { termsUrl: 'https://ayni.pe/terms' };
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderSignIn(setup);

    await fireEvent.press(screen.getByRole('link', { name: 'Términos de uso' }));
    expect(openURL).toHaveBeenCalledWith('https://ayni.pe/terms');
    // Sin URL configurada el texto se muestra, pero no es un enlace.
    expect(screen.getByText('Política de privacidad')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Política de privacidad' })).toBeNull();
  });
});

describe('VerifyOtpScreen', () => {
  const CODE_LABEL = 'Código de verificación';

  async function renderVerify(options: { cooldownSeconds?: number; latencyMs?: number } = {}) {
    const authApi = new InMemoryAuthApi({
      latencyMs: options.latencyMs ?? 0,
      resendCooldownSeconds: options.cooldownSeconds ?? 0,
    });
    const setup = createTestContainer({ authApi });
    const challenge = await setup.container.auth.startAuthentication.execute('ana@mail.com');
    const view = await renderWithProviders(<VerifyOtpScreen challenge={challenge} />, setup);
    return { ...view, challenge };
  }

  const typeCode = (code: string) => fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);

  it('muestra a qué destino enmascarado se envió el código', async () => {
    await renderVerify();
    expect(screen.getByText(/a\*\*\*@mail\.com/)).toBeTruthy();
  });

  it('el código correcto abre la sesión persistente con Remember Me', async () => {
    const { adapters } = await renderVerify();
    await typeCode(FAKE_OTP_CODE);
    await waitFor(() => expect(adapters.tokenStorage.tokens).not.toBeNull());
    expect(adapters.tokenStorage.persisted).toBe(true);
  });

  it('sin Remember Me la sesión queda solo en memoria', async () => {
    const { adapters } = await renderVerify();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Recordarme' }));
    expect(screen.getByRole('checkbox', { name: 'Recordarme' })).not.toBeChecked();
    await typeCode(FAKE_OTP_CODE);
    await waitFor(() => expect(adapters.tokenStorage.persisted).toBe(false));
  });

  it('un código incorrecto muestra los intentos restantes y limpia las casillas', async () => {
    await renderVerify();
    await typeCode('0000');
    expect(await screen.findByText('Código incorrecto. Intentos restantes: 4.')).toBeTruthy();
    expect(screen.getByLabelText(CODE_LABEL).props.value).toBe('');
  });

  it('ante un fallo de red conserva el código y permite reintentar', async () => {
    const { adapters } = await renderVerify();
    const verify = jest
      .spyOn(adapters.authApi, 'verifyOtp')
      .mockRejectedValueOnce(new AppError('network', 'offline'));

    await typeCode(FAKE_OTP_CODE);
    expect(
      await screen.findByText('No hay conexión. Revisa tu internet e inténtalo de nuevo.'),
    ).toBeTruthy();
    expect(screen.getByLabelText(CODE_LABEL).props.value).toBe(FAKE_OTP_CODE);

    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar verificación' }));
    await waitFor(() => expect(adapters.tokenStorage.tokens).not.toBeNull());
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('el reenvío espera al contador y luego emite un código nuevo', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const { adapters } = await renderVerify({ cooldownSeconds: 30 });
      const resend = jest.spyOn(adapters.authApi, 'resendOtp');
      const resendButton = () => screen.getByRole('button', { name: 'Reenviar' });

      expect(screen.getByText('00:30')).toBeTruthy();
      expect(resendButton()).toBeDisabled();

      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(screen.queryByText('00:01')).toBeNull();
      expect(resendButton()).toBeEnabled();

      await fireEvent.press(resendButton());
      await act(() => jest.advanceTimersByTimeAsync(0));
      expect(resend).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Te enviamos un código nuevo.')).toBeTruthy();
      expect(screen.getByText('00:30')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('challengeParams', () => {
  const challenge: AuthChallenge = {
    challengeId: 'ch-1',
    channel: 'sms',
    maskedDestination: '+51 ••• ••• 321',
    expiresAt: new Date('2026-10-26T15:05:00.000Z'),
    resendAvailableAt: new Date('2026-10-26T15:00:30.000Z'),
  };

  it('ida y vuelta sin perder datos', () => {
    expect(fromChallengeParams(toChallengeParams(challenge))).toEqual(challenge);
  });

  it.each([
    [{}],
    [{ ...toChallengeParams(challenge), channel: 'fax' }],
    [{ ...toChallengeParams(challenge), expiresAt: 'no-es-fecha' }],
    [{ ...toChallengeParams(challenge), challengeId: '' }],
  ])('devuelve null con parámetros inválidos', (params) => {
    expect(fromChallengeParams(params)).toBeNull();
  });
});

describe('useCountdown', () => {
  it('cuenta hasta cero desde el reloj', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-26T15:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      const target = new Date('2026-10-26T15:00:02.500Z');
      const { result } = await renderHook(() => useCountdown(target));
      expect(result.current).toBe(3);
      await act(() => jest.advanceTimersByTimeAsync(3000));
      expect(result.current).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('formatea minutos y segundos', () => {
    expect(formatCountdown(159)).toBe('02:39');
    expect(formatCountdown(0)).toBe('00:00');
  });
});
