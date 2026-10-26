export interface DeviceLocalePort {
  /** Códigos de idioma del dispositivo en orden de preferencia (p. ej. ['es', 'en']). */
  preferredLanguageCodes(): string[];
}
