import { AuthTokens, InvalidAuthTokensError } from './AuthTokens';

describe('AuthTokens', () => {
  it('normaliza los espacios de las credenciales', () => {
    const tokens = AuthTokens.create({ accessToken: ' a1 ', refreshToken: 'r1\n' });
    expect(tokens).toMatchObject({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it.each([
    { accessToken: '', refreshToken: 'r1' },
    { accessToken: 'a1', refreshToken: '   ' },
  ])('exige ambas credenciales %#', (input) => {
    expect(() => AuthTokens.create(input)).toThrow(InvalidAuthTokensError);
  });
});
