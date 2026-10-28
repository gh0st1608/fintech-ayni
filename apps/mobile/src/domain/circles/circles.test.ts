import { Money } from '@/domain/shared/value-objects/Money';

import { IncompleteJoinDraftError, JoinCircleDraft } from './JoinCircleDraft';
import { availablePayoutRange, type JoinConfig } from './JoinConfig';
import {
  InstallmentOption,
  InvalidInstallmentOptionError,
} from './value-objects/InstallmentOption';
import { InvalidPayoutRangeError, PayoutRange } from './value-objects/PayoutRange';
import { InvalidSlotError, Slot } from './value-objects/Slot';

const pen = (major: number) => Money.fromMajor(major, 'PEN');
const range = () => PayoutRange.create({ min: pen(3000), max: pen(120000), step: pen(500) });

describe('PayoutRange', () => {
  it('ajusta el máximo al último salto alcanzable desde el mínimo', () => {
    const odd = PayoutRange.create({ min: pen(3000), max: pen(4200), step: pen(500) });
    expect(odd.max.equals(pen(4000))).toBe(true);
  });

  it.each([
    [{ min: pen(3000), max: pen(1000), step: pen(500) }],
    [{ min: pen(0), max: pen(1000), step: pen(500) }],
    [{ min: pen(3000), max: pen(6000), step: pen(0) }],
    [{ min: pen(3000), max: Money.fromMajor(6000, 'USD'), step: pen(500) }],
  ])('rechaza rangos inválidos', (input) => {
    expect(() => PayoutRange.create(input)).toThrow(InvalidPayoutRangeError);
  });

  it('clamp lleva cualquier monto al salto más cercano dentro del rango', () => {
    expect(range().clamp(pen(3740).amount).equals(pen(3500))).toBe(true);
    expect(range().clamp(pen(3760).amount).equals(pen(4000))).toBe(true);
    expect(range().clamp(0).equals(pen(3000))).toBe(true);
    expect(range().clamp(pen(999999).amount).equals(pen(120000))).toBe(true);
  });

  it('isValid exige moneda, límites y salto', () => {
    expect(range().isValid(pen(3500))).toBe(true);
    expect(range().isValid(pen(3600))).toBe(false);
    expect(range().isValid(pen(2500))).toBe(false);
    expect(range().isValid(Money.fromMajor(3500, 'USD'))).toBe(false);
  });

  it('capTo limita el máximo al límite del usuario, o null si no alcanza el mínimo', () => {
    expect(range().capTo(pen(10250))?.max.equals(pen(10000))).toBe(true);
    expect(range().capTo(pen(500000))?.max.equals(pen(120000))).toBe(true);
    expect(range().capTo(pen(2000))).toBeNull();
    expect(() => range().capTo(Money.fromMajor(10000, 'USD'))).toThrow(InvalidPayoutRangeError);
  });
});

describe('availablePayoutRange', () => {
  const config = (userPayoutLimit?: Money): JoinConfig => ({
    payoutRange: range(),
    userPayoutLimit,
    savingProgramMax: pen(1000000),
  });

  it('sin límite del usuario devuelve el rango general', () => {
    expect(availablePayoutRange(config())?.max.equals(pen(120000))).toBe(true);
  });

  it('con límite devuelve el rango recortado', () => {
    expect(availablePayoutRange(config(pen(20000)))?.max.equals(pen(20000))).toBe(true);
  });
});

describe('InstallmentOption', () => {
  it('por defecto está dentro del límite mensual', () => {
    const option = InstallmentOption.create({ months: 6, installment: pen(5000) });
    expect(option.withinMonthlyLimit).toBe(true);
  });

  it.each([
    [{ months: 0, installment: pen(5000) }],
    [{ months: 1.5, installment: pen(5000) }],
    [{ months: 6, installment: pen(0) }],
  ])('rechaza combinaciones inválidas', (input) => {
    expect(() => InstallmentOption.create(input)).toThrow(InvalidInstallmentOptionError);
  });

  it('sameAs compara meses y cuota, no la disponibilidad', () => {
    const option = InstallmentOption.create({ months: 6, installment: pen(5000) });
    const blocked = InstallmentOption.create({
      months: 6,
      installment: pen(5000),
      withinMonthlyLimit: false,
    });
    expect(option.sameAs(blocked)).toBe(true);
    expect(option.sameAs(InstallmentOption.create({ months: 6, installment: pen(4000) }))).toBe(
      false,
    );
  });
});

describe('JoinCircleDraft', () => {
  const sixMonths = InstallmentOption.create({ months: 6, installment: pen(1000) });

  it('es inmutable: cada paso devuelve un borrador nuevo', () => {
    const empty = JoinCircleDraft.empty();
    const withAmount = empty.withPayoutAmount(pen(6000));
    expect(empty.payoutAmount).toBeNull();
    expect(withAmount.payoutAmount?.equals(pen(6000))).toBe(true);
  });

  it('exige el monto antes de la cuota', () => {
    expect(() => JoinCircleDraft.empty().withInstallment(sixMonths)).toThrow(
      IncompleteJoinDraftError,
    );
  });

  it('exige monto y cuota antes del turno', () => {
    const slot = Slot.create({
      position: 1,
      payoutPeriod: '2026-11',
      type: 'fastestPayout',
      fee: pen(100),
      discount: pen(0),
      available: true,
    });
    expect(() => JoinCircleDraft.empty().withPayoutAmount(pen(6000)).withSlot(slot)).toThrow(
      IncompleteJoinDraftError,
    );
    const draft = JoinCircleDraft.empty()
      .withPayoutAmount(pen(6000))
      .withInstallment(sixMonths)
      .withSlot(slot);
    expect(draft.slot).toBe(slot);
    // Otra cuota descarta el turno; la misma lo conserva.
    expect(draft.withInstallment(sixMonths).slot).toBe(slot);
    const tenMonths = InstallmentOption.create({ months: 10, installment: pen(600) });
    expect(draft.withInstallment(tenMonths).slot).toBeNull();
    expect(draft.withPayoutAmount(pen(7000)).slot).toBeNull();
  });

  it('el método de cobro va después del turno y se conserva al cambiar los pasos previos', () => {
    const slot = Slot.create({
      position: 2,
      payoutPeriod: '2026-12',
      type: 'fastestPayout',
      fee: pen(50),
      discount: pen(0),
      available: true,
    });
    const withInstallment = JoinCircleDraft.empty()
      .withPayoutAmount(pen(6000))
      .withInstallment(sixMonths);
    expect(() => withInstallment.withPayoutMethod('bankTransfer')).toThrow(
      IncompleteJoinDraftError,
    );

    const complete = withInstallment.withSlot(slot).withPayoutMethod('bankTransfer');
    expect(complete.payoutMethod).toBe('bankTransfer');
    expect(complete.isComplete()).toBe(true);
    expect(withInstallment.isComplete()).toBe(false);
    // Es una preferencia del usuario: no depende del monto, la cuota ni el turno.
    const otherAmount = complete.withPayoutAmount(pen(7000));
    expect(otherAmount.payoutMethod).toBe('bankTransfer');
    expect(otherAmount.isComplete()).toBe(false);
  });

  it('cambiar el monto descarta la cuota; repetir el mismo la conserva', () => {
    const draft = JoinCircleDraft.empty().withPayoutAmount(pen(6000)).withInstallment(sixMonths);
    expect(draft.withPayoutAmount(pen(6000)).installment).toBe(sixMonths);
    expect(draft.withPayoutAmount(pen(6500)).installment).toBeNull();
  });
});

describe('Slot', () => {
  const base = {
    position: 3,
    payoutPeriod: '2027-01',
    type: 'lowestFees' as const,
    fee: pen(0),
    discount: pen(0),
    available: true,
  };

  it('expone el primer día del mes de cobro', () => {
    const date = Slot.create(base).payoutDate;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 0, 1]);
  });

  it.each([
    [{ ...base, position: 0 }],
    [{ ...base, payoutPeriod: '2027-13' }],
    [{ ...base, payoutPeriod: '01/2027' }],
    [{ ...base, fee: pen(-1) }],
    [{ ...base, discount: Money.fromMajor(1, 'USD') }],
  ])('rechaza slots inválidos', (input) => {
    expect(() => Slot.create(input)).toThrow(InvalidSlotError);
  });
});
