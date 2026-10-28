/** Perfil del usuario en el backend (PATCH /v1/me). */
export interface UserProfileRepositoryPort {
  /** Idioma de las notificaciones y los emails del backend. */
  updatePreferredLanguage(languageCode: string): Promise<void>;
}
