import { IncompleteJoinDraftError, JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import {
  MonthlyLimitExceededError,
  NationalIdRequiredError,
  PayoutMethodLimitExceededError,
  PayoutMethodRequiredError,
} from '@/domain/circles/JoinedCircle';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { Slot, SlotNoLongerAvailableError } from '@/domain/circles/value-objects/Slot';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleMembershipRepository } from '@/infrastructure/circles/InMemoryCircleMembershipRepository';
import { FakeIdGenerator } from '@test/fakes/ports';

import { JoinCircleUseCase } from './JoinCircleUseCase';

const pen = (major: number) => Money.fromMajor(major, 'PEN');

function draft(position = 3, circleId: string | null = null) {
  return JoinCircleDraft.empty()
    .withPayoutAmount(pen(30_000))
    .withInstallment(InstallmentOption.create({ months: 10, installment: pen(3_000) }))
    .withSlot(
      Slot.create({
        position,
        payoutPeriod: '2027-01',
        type: 'lowestFees',
        fee: pen(0),
        discount: pen(0),
        available: true,
        circleId,
      }),
    )
    .withPayoutMethod('bankTransfer');
}

function setup() {
  const repository = new InMemoryCircleMembershipRepository({ latencyMs: 0, startsOn: '2026-11' });
  const ids = new FakeIdGenerator();
  const join = jest.spyOn(repository, 'join');
  return { repository, ids, join, useCase: new JoinCircleUseCase(repository, ids) };
}

describe('JoinCircleUseCase', () => {
  it('une al usuario con el pedido del borrador', async () => {
    const { useCase, join } = setup();
    await expect(useCase.execute(draft())).resolves.toMatchObject({
      position: 3,
      payoutPeriod: '2027-01',
      created: true,
    });
    expect(join).toHaveBeenCalledWith(
      { circleId: null, payout: pen(30_000), months: 10, position: 3 },
      'key-1',
    );
  });

  it('repite la clave en los reintentos, también con un borrador nuevo igual', async () => {
    const { useCase, join, ids, repository } = setup();
    repository.rejectNextWith('SLOT_TAKEN');
    await expect(useCase.execute(draft())).rejects.toThrow(SlotNoLongerAvailableError);

    const retried = await useCase.execute(draft());
    const replay = await useCase.execute(draft());
    expect([retried.created, replay.created]).toEqual([true, false]);
    expect(join.mock.calls.map(([, key]) => key)).toEqual(['key-1', 'key-1', 'key-1']);
    expect(ids.issued).toEqual(['key-1']);
  });

  it('otro pedido genera otra clave', async () => {
    const { useCase, join } = setup();
    await useCase.execute(draft(3));
    await useCase.execute(draft(4));
    await useCase.execute(draft(4, 'c-1'));
    expect(join.mock.calls.map(([, key]) => key)).toEqual(['key-1', 'key-2', 'key-3']);
  });

  it('no llama al backend con un borrador incompleto', async () => {
    const { useCase, join } = setup();
    await expect(useCase.execute(JoinCircleDraft.empty())).rejects.toThrow(
      IncompleteJoinDraftError,
    );
    expect(join).not.toHaveBeenCalled();
  });

  it.each([
    ['NATIONAL_ID_REQUIRED', NationalIdRequiredError],
    ['MONTHLY_LIMIT_EXCEEDED', MonthlyLimitExceededError],
    ['PAYOUT_METHOD_REQUIRED', PayoutMethodRequiredError],
    ['PAYOUT_METHOD_LIMIT_EXCEEDED', PayoutMethodLimitExceededError],
    ['SLOT_TAKEN', SlotNoLongerAvailableError],
    ['ALREADY_MEMBER', SlotNoLongerAvailableError],
    ['CIRCLE_ALREADY_STARTED', SlotNoLongerAvailableError],
    ['CIRCLE_NOT_FOUND', SlotNoLongerAvailableError],
  ])('traduce %s a un error tipado', async (code, TypedError) => {
    const { useCase, repository } = setup();
    jest.spyOn(repository, 'join').mockRejectedValueOnce(new AppError('conflict', 'no', { code }));
    await expect(useCase.execute(draft())).rejects.toThrow(TypedError);
  });

  it('propaga los demás errores', async () => {
    const { useCase, repository } = setup();
    const offline = new AppError('network', 'offline');
    jest.spyOn(repository, 'join').mockRejectedValueOnce(offline);
    await expect(useCase.execute(draft())).rejects.toBe(offline);

    const reused = new AppError('conflict', 'no', { code: 'IDEMPOTENCY_KEY_REUSED' });
    jest.spyOn(repository, 'join').mockRejectedValueOnce(reused);
    await expect(useCase.execute(draft())).rejects.toBe(reused);
  });
});
