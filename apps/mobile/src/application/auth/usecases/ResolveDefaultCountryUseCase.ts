import { type Country, countryFor, DEFAULT_REGION } from '@/domain/auth/countries';
import type { DeviceLocalePort } from '@/domain/i18n/ports/DeviceLocalePort';

/**
 * País inicial del teléfono (pending-scope D14): la primera región del dispositivo que está en la
 * lista, o Perú. La persona puede cambiarlo.
 */
export class ResolveDefaultCountryUseCase {
  constructor(private readonly deviceLocale: DeviceLocalePort) {}

  execute(): Country {
    const regions = this.deviceLocale.preferredRegionCodes();
    for (const region of regions) {
      const country = countryFor(region);
      if (country) return country;
    }
    return countryFor(DEFAULT_REGION)!;
  }
}
