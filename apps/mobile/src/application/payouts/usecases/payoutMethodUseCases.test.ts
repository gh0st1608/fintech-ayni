import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import {
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
      repository({ selected: 'bankTransfer' }),
    ).execute();
    expect(view.selected).toBe('bankTransfer');
  });
});

describe('SelectPayoutMethodUseCase', () => {
  it('guarda un método disponible', async () => {
    const repo = repository();
    const catalog = await repo.list();
    await expect(
      new SelectPayoutMethodUseCase(repo).execute('digitalWallet', catalog),
    ).resolves.toMatchObject({ selected: 'digitalWallet' });
    expect(repo.selected).toBe('digitalWallet');
  });

  it('rechaza sin llamar al backend un método que no está disponible en el catálogo', async () => {
    const repo = repository();
    const select = jest.spyOn(repo, 'select');
    const catalog = await repo.list();
    await expect(new SelectPayoutMethodUseCase(repo).execute('fawry', catalog)).rejects.toThrow(
      PayoutMethodNotAvailableError,
    );
    expect(select).not.toHaveBeenCalled();
  });

  it('traduce el rechazo del mes de payout a un error tipado', async () => {
    const repo = repository({ selected: 'prepaidCard', changeLocked: true });
    const catalog = await repo.list();
    await expect(
      new SelectPayoutMethodUseCase(repo).execute('bankTransfer', catalog),
    ).rejects.toThrow(PayoutMethodChangeNotAllowedError);
  });

  it('traduce el método rechazado por el backend y propaga los demás errores', async () => {
    const catalog = await repository().list();
    const failing = (error: Error): PayoutMethodRepositoryPort => ({
      list: () => Promise.resolve(catalog),
      select: () => Promise.reject(error),
    });
    const notAvailable = new AppError('validation', 'no', { code: 'PAYOUT_METHOD_NOT_AVAILABLE' });
    await expect(
      new SelectPayoutMethodUseCase(failing(notAvailable)).execute('bankTransfer', catalog),
    ).rejects.toThrow(PayoutMethodNotAvailableError);

    const offline = new AppError('network', 'offline');
    await expect(
      new SelectPayoutMethodUseCase(failing(offline)).execute('bankTransfer', catalog),
    ).rejects.toBe(offline);
  });
});
