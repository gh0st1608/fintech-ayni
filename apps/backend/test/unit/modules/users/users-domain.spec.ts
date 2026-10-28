import { User } from '@src/modules/users/domain/entities/user';
import {
  InvalidLoginIdentifierError,
  LoginIdentifier,
} from '@src/modules/users/domain/value-objects/login-identifier';

describe('LoginIdentifier', () => {
  it('normaliza el email en minúsculas y lo envía por email', () => {
    const identifier = LoginIdentifier.parse('  Ana.Perez@Mail.COM ', 'email');
    expect(identifier.value).toBe('ana.perez@mail.com');
    expect(identifier.channel).toBe('email');
    expect(identifier.masked()).toBe('a***@mail.com');
  });

  it('acepta teléfonos E.164, los envía por SMS y los enmascara', () => {
    const identifier = LoginIdentifier.parse('+51987654321', 'phone');
    expect(identifier.channel).toBe('sms');
    expect(identifier.masked()).toBe('+51 ••• ••• 321');
  });

  it.each([
    ['ana@', 'email'],
    ['ana@mail.c', 'email'],
    [`${'a'.repeat(250)}@mail.com`, 'email'],
    ['987654321', 'phone'],
    ['+51 987 654 321', 'phone'],
    ['+0123456789', 'phone'],
    ['ana@mail.com', 'phone'],
  ] as const)('rechaza %s como %s, con el campo en details', (value, type) => {
    expect(() => LoginIdentifier.parse(value, type)).toThrow(InvalidLoginIdentifierError);
    try {
      LoginIdentifier.parse(value, type);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { identifier: 'invalid' },
      });
    }
  });
});

describe('User', () => {
  it('se registra pendiente de verificación con el identificador que usó', () => {
    const byEmail = User.register('u-1', LoginIdentifier.parse('ana@mail.com', 'email'));
    expect(byEmail).toMatchObject({ email: 'ana@mail.com', phone: null });
    expect(byEmail.status).toBe('pending_verification');

    const byPhone = User.register('u-2', LoginIdentifier.parse('+51987654321', 'phone'));
    expect(byPhone).toMatchObject({ email: null, phone: '+51987654321' });
  });

  it('se activa y cambia su idioma preferido', () => {
    const user = User.register('u-1', LoginIdentifier.parse('ana@mail.com', 'email'));
    user.activate();
    user.changePreferredLanguage('en');
    expect(user.status).toBe('active');
    expect(user.preferredLanguage).toBe('en');
  });

  it('devuelve el identificador del canal pedido, si lo tiene', () => {
    const user = User.restore({
      id: 'u-1',
      email: 'ana@mail.com',
      phone: null,
      status: 'active',
      preferredLanguage: null,
    });
    expect(user.loginIdentifier('email')?.value).toBe('ana@mail.com');
    expect(user.loginIdentifier('sms')).toBeNull();

    const phoneOnly = User.restore({
      id: 'u-2',
      email: null,
      phone: '+51987654321',
      status: 'active',
      preferredLanguage: 'es',
    });
    expect(phoneOnly.loginIdentifier('sms')?.value).toBe('+51987654321');
    expect(phoneOnly.loginIdentifier('email')).toBeNull();
  });
});
