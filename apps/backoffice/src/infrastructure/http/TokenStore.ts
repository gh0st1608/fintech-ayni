/**
 * Token del personal solo en memoria (base técnica §11 y docs/backoffice-plan.md §6): se pierde al
 * recargar la página, a cambio de no quedar expuesto en LocalStorage.
 */
export class TokenStore {
  private token: string | null = null;

  get(): string | null {
    return this.token;
  }

  set(token: string): void {
    this.token = token;
  }

  clear(): void {
    this.token = null;
  }
}
