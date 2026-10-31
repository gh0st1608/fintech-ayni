import { InvalidReferralSummaryError } from '@/domain/referrals/Referral';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import {
  FAKE_OWN_REFERRAL_CODE,
  InMemoryReferralRepository,
} from '@/infrastructure/referrals/InMemoryReferralRepository';
import { FakeClipboard, FakeShare, InMemoryPendingReferral } from '@test/fakes/ports';

import {
  CapturePendingReferralUseCase,
  ClaimPendingReferralUseCase,
  CopyReferralCodeUseCase,
  ListReferralsUseCase,
  ShareInviteUseCase,
} from './referralUseCases';

const repository = (options = {}) =>
  new InMemoryReferralRepository({ latencyMs: 0, currency: 'PEN', ...options });

describe('ListReferralsUseCase', () => {
  it('pagina los invitados por cursor con el mismo saldo', async () => {
    const list = new ListReferralsUseCase(repository({ pageSize: 2, redeemed: 5000 }));
    const first = await list.execute(null);
    expect(first.invitees).toHaveLength(2);
    expect(first.summary.balance).toEqual(Money.of(10000, 'PEN'));

    const second = await list.execute(first.nextCursor);
    expect(second.invitees).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('no entrega un saldo incoherente', async () => {
    const referrals = repository();
    jest.spyOn(referrals, 'listReferrals').mockResolvedValue({
      summary: {
        earned: Money.of(100, 'PEN'),
        redeemed: Money.of(0, 'PEN'),
        balance: Money.of(50, 'PEN'),
      },
      invitees: [],
      nextCursor: null,
    });
    await expect(new ListReferralsUseCase(referrals).execute(null)).rejects.toThrow(
      InvalidReferralSummaryError,
    );
  });
});

describe('copiar y compartir', () => {
  const invite = {
    code: 'K7M2Q9XA',
    link: 'ayni://invite?code=K7M2Q9XA',
    reward: Money.of(15000, 'PEN'),
  };

  it('copia solo el código', async () => {
    const clipboard = new FakeClipboard();
    await new CopyReferralCodeUseCase(clipboard).execute(invite);
    expect(clipboard.text).toBe('K7M2Q9XA');
  });

  it('comparte el mensaje con el enlace al final y dice si se compartió', async () => {
    const sharer = new FakeShare(false);
    await expect(new ShareInviteUseCase(sharer).execute(invite, 'Únete')).resolves.toBe(false);
    expect(sharer.messages).toEqual(['Únete\nayni://invite?code=K7M2Q9XA']);
  });
});

describe('CapturePendingReferralUseCase', () => {
  it('guarda el código normalizado del enlace', async () => {
    const pending = new InMemoryPendingReferral();
    await expect(new CapturePendingReferralUseCase(pending).execute('k7m2q9xb')).resolves.toBe(
      true,
    );
    expect(pending.stored).toBe('K7M2Q9XB');
  });

  it.each([undefined, ['K7M2Q9XB', 'K7M2Q9XC'], 'no-valido'])(
    'ignora %p sin lanzar',
    async (raw) => {
      const pending = new InMemoryPendingReferral('K7M2Q9XC');
      await expect(new CapturePendingReferralUseCase(pending).execute(raw)).resolves.toBe(false);
      expect(pending.stored).toBe('K7M2Q9XC');
    },
  );

  it('un fallo del almacenamiento no rompe la navegación', async () => {
    const pending = new InMemoryPendingReferral();
    jest.spyOn(pending, 'save').mockRejectedValue(new Error('disk'));
    await expect(new CapturePendingReferralUseCase(pending).execute('K7M2Q9XB')).resolves.toBe(
      false,
    );
  });
});

describe('ClaimPendingReferralUseCase', () => {
  it('sin código pendiente no llama al backend', async () => {
    const referrals = repository();
    const claim = jest.spyOn(referrals, 'claim');
    const useCase = new ClaimPendingReferralUseCase(referrals, new InMemoryPendingReferral());
    await expect(useCase.execute()).resolves.toBe('nothing_pending');
    expect(claim).not.toHaveBeenCalled();
  });

  it('envía el código y lo borra', async () => {
    const referrals = repository();
    const pending = new InMemoryPendingReferral('K7M2Q9XB');
    await expect(new ClaimPendingReferralUseCase(referrals, pending).execute()).resolves.toBe(
      'claimed',
    );
    expect(referrals.claimed).toBe('K7M2Q9XB');
    expect(pending.stored).toBeNull();
  });

  it('un rechazo del backend descarta el código', async () => {
    const pending = new InMemoryPendingReferral(FAKE_OWN_REFERRAL_CODE);
    await expect(new ClaimPendingReferralUseCase(repository(), pending).execute()).resolves.toBe(
      'rejected',
    );
    expect(pending.stored).toBeNull();
  });

  it.each([
    new AppError('network', 'offline'),
    new AppError('unauthorized', 'expired'),
    new Error('boom'),
  ])('un fallo transitorio deja el código para después (%p)', async (error) => {
    const referrals = repository();
    jest.spyOn(referrals, 'claim').mockRejectedValue(error);
    const pending = new InMemoryPendingReferral('K7M2Q9XB');
    await expect(new ClaimPendingReferralUseCase(referrals, pending).execute()).resolves.toBe(
      'pending',
    );
    expect(pending.stored).toBe('K7M2Q9XB');
  });

  it('nunca lanza aunque falle el almacenamiento', async () => {
    const pending = new InMemoryPendingReferral();
    jest.spyOn(pending, 'get').mockRejectedValue(new Error('disk'));
    await expect(new ClaimPendingReferralUseCase(repository(), pending).execute()).resolves.toBe(
      'pending',
    );
  });
});
