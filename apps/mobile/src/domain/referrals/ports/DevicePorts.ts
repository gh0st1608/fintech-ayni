/** Hoja nativa para compartir. Resuelve `false` si el usuario la cerró sin compartir. */
export interface SharePort {
  share(message: string): Promise<boolean>;
}

export interface ClipboardPort {
  copy(text: string): Promise<void>;
}

/**
 * Código recibido por un enlace de invitación que todavía no se envió al backend. Es un dato no
 * sensible: sobrevive al cierre de la app hasta que el usuario inicie sesión.
 */
export interface PendingReferralPort {
  get(): Promise<string | null>;
  save(code: string): Promise<void>;
  clear(): Promise<void>;
}
