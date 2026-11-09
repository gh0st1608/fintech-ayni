import { parseLookup } from '@src/modules/users/application/use-cases/admin-users.use-cases';

describe('parseLookup (búsqueda de personas del back-office)', () => {
  it('reconoce un id, un email completo o un teléfono con código de país', () => {
    expect(parseLookup(' 0B0C5C4E-1D8F-4B8A-9F3E-111111111111 ')).toEqual({
      by: 'id',
      value: '0b0c5c4e-1d8f-4b8a-9f3e-111111111111',
    });
    expect(parseLookup(' Ana@Mail.com ')).toEqual({ by: 'email', value: 'ana@mail.com' });
    expect(parseLookup('+51 987 654-321')).toEqual({ by: 'phone', value: '+51987654321' });
  });

  it('no admite búsquedas parciales ni formatos inválidos', () => {
    for (const query of ['ana', 'mail.com', '987654321', '+51', 'ana@', '@mail.com', '   ']) {
      expect(() => parseLookup(query)).toThrow(/Busca por email completo/);
    }
  });
});
