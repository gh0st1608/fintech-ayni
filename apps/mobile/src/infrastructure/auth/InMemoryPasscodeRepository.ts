import type { PasscodeRepositoryPort } from '@/domain/auth/ports/PasscodeRepositoryPort';
import type { Passcode } from '@/domain/auth/value-objects/Passcode';
import { AppError } from '@/domain/shared/errors/AppError';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

const MAX_ATTEMPTS = 5;

const invalid = (attemptsRemaining: number) =>
  new AppError('business', 'Passcode incorrecto', {
    code: 'PASSCODE_INVALID',
    fieldErrors: { attemptsRemaining: String(attemptsRemaining) },
  });

/** Passcode falso (solo dev y pruebas), con las reglas de docs/api/me.md. */
export class InMemoryPasscodeRepository implements PasscodeRepositoryPort {
  private failures = 0;
  private readonly latencyMs: number;

  constructor(options: { latencyMs?: number; value?: string } = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.value = options.value ?? null;
  }

  value: string | null;

  async isConfigured(): Promise<boolean> {
    await simulateLatency(this.latencyMs);
    return this.value !== null;
  }

  async save(next: Passcode, current?: Passcode): Promise<void> {
    await simulateLatency(this.latencyMs);
    if (this.value !== null) this.check(current?.value);
    this.value = next.value;
  }

  async verify(passcode: Passcode): Promise<void> {
    await simulateLatency(this.latencyMs);
    this.check(passcode.value);
  }

  private check(candidate: string | undefined): void {
    if (this.failures >= MAX_ATTEMPTS) {
      throw new AppError('rate_limited', 'Demasiados intentos', { retryAfterSeconds: 900 });
    }
    if (candidate !== this.value) {
      this.failures += 1;
      throw invalid(MAX_ATTEMPTS - this.failures);
    }
    this.failures = 0;
  }
}
