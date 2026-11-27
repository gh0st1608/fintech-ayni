import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { SlotNoLongerAvailableError } from '@/domain/circles/value-objects/Slot';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';

import { ConfirmSlotSelectionUseCase } from './ConfirmSlotSelectionUseCase';
import { ListAvailableSlotsUseCase } from './ListAvailableSlotsUseCase';

const pen = (major: number) => Money.fromMajor(major, 'PEN');
const PAYOUT = pen(30_000);
const TEN_MONTHS = InstallmentOption.create({ months: 10, installment: pen(3_000) });

const repository = (takenPositions: number[] = []) =>
  new InMemoryCircleQuoteRepository({ latencyMs: 0, startsOn: '2026-11', takenPositions });

describe('ListAvailableSlotsUseCase', () => {
  it('agrupa por tipo de turno en orden de cobro, con los ocupados marcados', async () => {
    const { groups } = await new ListAvailableSlotsUseCase(repository([2])).execute(
      PAYOUT,
      TEN_MONTHS,
    );
    expect(groups.map(({ type, slots }) => [type, slots.map((slot) => slot.position)])).toEqual([
      ['fastestPayout', [1, 2]],
      ['lowestFees', [3, 4, 5, 6, 7, 8]],
      ['highestReturn', [9, 10]],
    ]);
    expect(groups[0]?.slots.map((slot) => slot.available)).toEqual([true, false]);
  });

  it('devuelve siempre los tres grupos aunque alguno quede vacío', async () => {
    const twoMonths = InstallmentOption.create({ turns: 2, installment: pen(15_000) });
    const { groups } = await new ListAvailableSlotsUseCase(repository()).execute(PAYOUT, twoMonths);
    expect(groups.map(({ slots }) => slots.length)).toEqual([0, 2, 0]);
  });

  it('trae las condiciones reales de la junta, en la unidad de su cadencia', async () => {
    // COPAYNI-116: la pantalla muestra la duración y la fecha de fin que calculó el servidor,
    // no una cuenta de meses hecha en el cliente.
    const weekly = InstallmentOption.create({
      turns: 4,
      installment: pen(7_500),
      cadence: 'weekly',
      unit: 'Semana',
      approximateDays: 28,
    });
    const { quote } = await new ListAvailableSlotsUseCase(repository()).execute(PAYOUT, weekly);

    expect(quote).toMatchObject({
      cadence: 'weekly',
      unit: 'Semana',
      turns: 4,
      startsOnDate: '2026-11-01',
      endsOnDate: '2026-11-22',
      durationDays: 28,
    });
  });
});

describe('ConfirmSlotSelectionUseCase', () => {
  it('devuelve el slot si sigue libre', async () => {
    const slot = await new ConfirmSlotSelectionUseCase(repository()).execute(PAYOUT, TEN_MONTHS, 9);
    expect(slot.position).toBe(9);
    expect(slot.payoutPeriod).toBe('2027-07');
  });

  it('falla con un error tipado si el slot se ocupó o no existe', async () => {
    const useCase = new ConfirmSlotSelectionUseCase(repository([4]));
    await expect(useCase.execute(PAYOUT, TEN_MONTHS, 4)).rejects.toThrow(
      SlotNoLongerAvailableError,
    );
    await expect(useCase.execute(PAYOUT, TEN_MONTHS, 11)).rejects.toThrow(
      SlotNoLongerAvailableError,
    );
  });
});
