import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';

import { InvalidLoginIdentifierError, LoginIdentifier } from './LoginIdentifier';
import { InvalidOtpCodeError, OtpCode } from './OtpCode';

describe('LoginIdentifier', () => {
  it('normaliza un email a minúsculas y sin espacios', () => {
    const identifier = LoginIdentifier.create('  Ana.Perez@Mail.COM ');
    expect(identifier).toMatchObject({ kind: 'email', value: 'ana.perez@mail.com' });
  });

  it('normaliza un teléfono internacional quitando separadores', () => {
    const identifier = LoginIdentifier.create('+51 (987) 654-321');
    expect(identifier).toMatchObject({ kind: 'phone', value: '+51987654321' });
  });

  it.each([
    ['', 'vacío'],
    ['ana@', 'email sin dominio'],
    ['ana@mail', 'email sin TLD'],
    ['ana @mail.com', 'email con espacios'],
    ['987654321', 'teléfono sin código de país'],
    ['+0987654321', 'código de país que empieza en 0'],
    ['+51 98a 654 321', 'teléfono con letras'],
    ['+1234567', 'teléfono demasiado corto'],
  ])('rechaza "%s" (%s)', (raw) => {
    expect(() => LoginIdentifier.create(raw)).toThrow(InvalidLoginIdentifierError);
    expect(LoginIdentifier.isValid(raw)).toBe(false);
  });

  it('rechaza emails más largos que el máximo del estándar', () => {
    expect(LoginIdentifier.isValid(`${'a'.repeat(250)}@mail.com`)).toBe(false);
  });

  it('isValid acepta formatos correctos', () => {
    expect(LoginIdentifier.isValid('ana@mail.com')).toBe(true);
    expect(LoginIdentifier.isValid('+14155552671')).toBe(true);
  });
});

describe('OtpCode', () => {
  it('acepta exactamente 4 dígitos', () => {
    expect(OtpCode.create(' 1234 ').value).toBe('1234');
  });

  it.each(['123', '12345', '12a4', ''])('rechaza "%s"', (raw) => {
    expect(() => OtpCode.create(raw)).toThrow(InvalidOtpCodeError);
  });
});

describe('OtpVerificationError', () => {
  it('solo un código incorrecto se puede reintentar sin pedir otro', () => {
    expect(new OtpVerificationError('invalid', 2).requiresResend).toBe(false);
    expect(new OtpVerificationError('expired').requiresResend).toBe(true);
    expect(new OtpVerificationError('attempts_exceeded').requiresResend).toBe(true);
  });
});
