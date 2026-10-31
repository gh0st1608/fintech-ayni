import type {
  ClipboardPort,
  PendingReferralPort,
  SharePort,
} from '@/domain/referrals/ports/DevicePorts';
import type { ReferralRepositoryPort } from '@/domain/referrals/ports/ReferralRepositoryPort';
import {
  assertReferralSummary,
  type ReferralInvite,
  type ReferralsPage,
} from '@/domain/referrals/Referral';
import { parseReferralCode } from '@/domain/referrals/ReferralCode';
import { AppError } from '@/domain/shared/errors/AppError';

export class GetMyReferralUseCase {
  constructor(private readonly repository: ReferralRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<ReferralInvite> {
    return this.repository.getMine(signal);
  }
}

/** Saldo e invitados; un saldo incoherente no se muestra (InvalidReferralSummaryError). */
export class ListReferralsUseCase {
  constructor(private readonly repository: ReferralRepositoryPort) {}

  async execute(cursor: string | null, signal?: AbortSignal): Promise<ReferralsPage> {
    const page = await this.repository.listReferrals(cursor, signal);
    assertReferralSummary(page.summary);
    return page;
  }
}

export class CopyReferralCodeUseCase {
  constructor(private readonly clipboard: ClipboardPort) {}

  execute(invite: ReferralInvite): Promise<void> {
    return this.clipboard.copy(invite.code);
  }
}

/** Comparte el mensaje traducido con el enlace al final, para que las apps lo detecten. */
export class ShareInviteUseCase {
  constructor(private readonly sharer: SharePort) {}

  execute(invite: ReferralInvite, message: string): Promise<boolean> {
    return this.sharer.share(`${message}\n${invite.link}`);
  }
}

/**
 * Guarda el código de un enlace de invitación (ayni://invite?code=…) hasta que haya sesión.
 * Un código mal formado se ignora: nunca rompe la navegación.
 */
export class CapturePendingReferralUseCase {
  constructor(private readonly pending: PendingReferralPort) {}

  async execute(raw: unknown): Promise<boolean> {
    if (typeof raw !== 'string') return false;
    let code: string;
    try {
      code = parseReferralCode(raw);
    } catch {
      return false;
    }
    try {
      await this.pending.save(code);
      return true;
    } catch {
      return false;
    }
  }
}

export type ClaimResult = 'claimed' | 'rejected' | 'pending' | 'nothing_pending';

/**
 * Envía el código pendiente al entrar con sesión, de mejor esfuerzo y sin bloquear la UI. Un
 * rechazo del backend (código inexistente, ya usado, propio o sin elegibilidad) lo descarta;
 * un fallo transitorio lo deja para el siguiente arranque.
 */
export class ClaimPendingReferralUseCase {
  constructor(
    private readonly repository: ReferralRepositoryPort,
    private readonly pending: PendingReferralPort,
  ) {}

  /** Nunca lanza. */
  async execute(): Promise<ClaimResult> {
    try {
      const code = await this.pending.get();
      if (!code) return 'nothing_pending';
      try {
        await this.repository.claim(code);
      } catch (error) {
        const retryable =
          !(error instanceof AppError) || error.isTransient || error.kind === 'unauthorized';
        if (retryable) return 'pending';
        await this.pending.clear();
        return 'rejected';
      }
      await this.pending.clear();
      return 'claimed';
    } catch {
      return 'pending';
    }
  }
}
