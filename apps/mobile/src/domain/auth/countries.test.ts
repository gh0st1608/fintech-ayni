import { ResolveDefaultCountryUseCase } from '@/application/auth/usecases/ResolveDefaultCountryUseCase';
import { FakeDeviceLocale } from '@test/fakes/ports';

import { COUNTRIES, countryFor, looksLikeLocalPhone, toInternational } from './countries';
import { LoginIdentifier } from './value-objects/LoginIdentifier';

describe('países del teléfono (D14)', () => {
  it('cada país tiene una región única y un código de país válido', () => {
    const regions = COUNTRIES.map((country) => country.regionCode);
    expect(new Set(regions).size).toBe(regions.length);
    for (const country of COUNTRIES) expect(country.callingCode).toMatch(/^\+[1-9]\d{0,2}$/);
  });

  it('encuentra el país por región sin importar mayúsculas', () => {
    expect(countryFor(' pe ')?.callingCode).toBe('+51');
    expect(countryFor('FR')).toBeNull();
    expect(countryFor(null)).toBeNull();
  });

  it('reconoce un número local: dígitos y separadores, sin "+" ni "@"', () => {
    expect(looksLikeLocalPhone('987 654 321')).toBe(true);
    expect(looksLikeLocalPhone('(01) 234-5678')).toBe(true);
    for (const value of ['+51987654321', 'ana@mail.com', '12345', 'ana', '']) {
      expect(looksLikeLocalPhone(value)).toBe(false);
    }
  });

  it('compone el número internacional y quita el 0 de larga distancia', () => {
    const peru = countryFor('PE')!;
    const argentina = countryFor('AR')!;
    expect(toInternational(peru, '987 654 321')).toBe('+51987654321');
    expect(toInternational(argentina, '011 2345-6789')).toBe('+541123456789');
    expect(LoginIdentifier.create(toInternational(peru, '987654321')).kind).toBe('phone');
  });
});

describe('ResolveDefaultCountryUseCase', () => {
  it('usa la primera región del dispositivo que está en la lista', () => {
    const useCase = new ResolveDefaultCountryUseCase(new FakeDeviceLocale(['es'], ['FR', 'CL']));
    expect(useCase.execute().regionCode).toBe('CL');
  });

  it('sin región conocida, Perú', () => {
    expect(
      new ResolveDefaultCountryUseCase(new FakeDeviceLocale(['es'], [])).execute().regionCode,
    ).toBe('PE');
    expect(
      new ResolveDefaultCountryUseCase(new FakeDeviceLocale(['es'], ['FR'])).execute().regionCode,
    ).toBe('PE');
  });
});
