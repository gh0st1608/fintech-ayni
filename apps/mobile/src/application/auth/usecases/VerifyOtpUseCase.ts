import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';
import { OtpCode } from '@/domain/auth/value-objects/OtpCode';

export interface VerifyOtpInput {
  challengeId: string;
  code: string;
  /** "Remember Me": persistir la sesión entre aperturas de la app. */
  rememberMe: boolean;
}

/** Verifica el OTP y abre la sesión, persistente o solo en memoria según "Remember Me". */
export class VerifyOtpUseCase {
  constructor(
    private readonly authApi: AuthApiPort,
    private readonly tokens: TokenStoragePort,
  ) {}

  async execute(input: VerifyOtpInput, signal?: AbortSignal): Promise<SessionStatus> {
    const code = OtpCode.create(input.code);
    const tokens = await this.authApi.verifyOtp(input.challengeId, code, signal);
    await this.tokens.save(tokens, { persist: input.rememberMe });
    return 'authenticated';
  }
}
