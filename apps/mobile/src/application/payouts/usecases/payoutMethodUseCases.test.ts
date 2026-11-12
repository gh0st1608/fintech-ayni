import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import {
  PayoutMethod,
  PayoutMethodChangeNotAllowedError,
  PayoutMethodNotAvailableError,
} from '@/domain/payouts/value-objects/PayoutMethod';
import { AppError } from '@/domain/shared/errors/AppError';
import { InMemoryPayoutMethodRepository } from '@/infrastructure/payouts/InMemoryPayoutMethodRepository';

import { ListPayoutMethodsUseCase, SelectPayoutMethodUseCase } from './payoutMethodUseCases';

const repository = (options = {}) =>
  new InMemoryPayoutMethodRepository('PEN', { latencyMs: 0, ...options });

describe('ListPayoutMethodsUseCase', () => {
  it('devuelve el catálogo con el método actual', async () => {
    const view = await new ListPayoutMethodsUseCase(
      repository({ selected: 'bankAccount' }),
    ).execute();
    expect(view.selected).toBe('bankAccount');
  });
});

describe('SelectPayoutMethodUseCase', () => {
  it('guarda un método disponible', async () => {
    const repo = repository();
    const catalog = await repo.list();
    await expect(
      new SelectPayoutMethodUseCase(repo).execute('wallet', catalog),
    ).resolves.toMatchObject({ selected: 'wallet' });
    expect(repo.selected).toBe('wallet');
  });

  it('rechaza sin llamar al backend un método que no está disponible en el catálogo', async () => {
    const repo = repository();
    const select = jest.spyOn(repo, 'select');
    // La billetera deshabilitada en el catálogo ("No disponible").
    const catalog = {
      methods: [
        PayoutMethod.create({ type: 'bankAccount', available: true }),
        PayoutMethod.create({ type: 'wallet', available: false }),
      ],
      selected: null,
    };
    await expect(new SelectPayoutMethodUseCase(repo).execute('wallet', catalog)).rejects.toThrow(
      PayoutMethodNotAvailableError,
    );
    expect(select).not.toHaveBeenCalled();
  });

  it('traduce el rechazo del mes de payout a un error tipado', async () => {
    const repo = repository({ selected: 'wallet', changeLocked: true });
    const catalog = await repo.list();
    await expect(
      new SelectPayoutMethodUseCase(repo).execute('bankAccount', catalog),
    ).rejects.toThrow(PayoutMethodChangeNotAllowedError);
  });

  it('traduce el método rechazado por el backend y propaga los demás errores', async () => {
    const catalog = await repository().list();
    const failing = (error: Error): PayoutMethodRepositoryPort => ({
      list: () => Promise.resolve(catalog),
      select: () => Promise.reject(error),
      account: () => Promise.resolve(null),
    });
    const notAvailable = new AppError('validation', 'no', { code: 'PAYOUT_METHOD_NOT_AVAILABLE' });
    await expect(
      new SelectPayoutMethodUseCase(failing(notAvailable)).execute('bankAccount', catalog),
    ).rejects.toThrow(PayoutMethodNotAvailableError);

    const offline = new AppError('network', 'offline');
    await expect(
      new SelectPayoutMethodUseCase(failing(offline)).execute('bankAccount', catalog),
    ).rejects.toBe(offline);
  });
});
