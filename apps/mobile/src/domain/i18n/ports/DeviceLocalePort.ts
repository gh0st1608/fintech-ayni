export interface DeviceLocalePort {
  /** Códigos de idioma del dispositivo en orden de preferencia (p. ej. ['es', 'en']). */
  preferredLanguageCodes(): string[];
  /** Regiones ISO 3166-1 alfa-2 del dispositivo en orden de preferencia (p. ej. ['PE']). */
  preferredRegionCodes(): string[];
}
