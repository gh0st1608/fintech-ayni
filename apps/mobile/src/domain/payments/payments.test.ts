import { invalidCardFields, passesLuhn, type CardDetails } from './CardDetails';

const CARD: CardDetails = {
  number: '4509 9535 6623 3704',
  holderName: 'Ana Quispe',
  expirationMonth: 11,
  expirationYear: 2030,
  securityCode: '123',
  documentNumber: '45678912',
};
const NOW = new Date(2026, 9, 30);

describe('CardDetails', () => {
  it('valida el número con Luhn', () => {
    expect(passesLuhn('4509953566233704')).toBe(true);
    expect(passesLuhn('4509953566233705')).toBe(false);
  });

  it('acepta una tarjeta válida y señala cada campo inválido', () => {
    expect(invalidCardFields(CARD, NOW)).toEqual([]);
    expect(
      invalidCardFields(
        {
          number: '1234',
          holderName: ' ',
          expirationMonth: 9,
          expirationYear: 2026,
          securityCode: '12',
          documentNumber: '12',
        },
        NOW,
      ),
    ).toEqual(['number', 'holderName', 'expiration', 'securityCode', 'documentNumber']);
    // El mes en curso todavía es válido; el mes 13 no.
    expect(invalidCardFields({ ...CARD, expirationMonth: 10, expirationYear: 2026 }, NOW)).toEqual(
      [],
    );
    expect(invalidCardFields({ ...CARD, expirationMonth: 13 }, NOW)).toEqual(['expiration']);
  });
});
