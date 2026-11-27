import { z } from 'zod';

import type { CircleQuoteRepositoryPort } from '@/domain/circles/ports/CircleQuoteRepositoryPort';
import type { RecommendedCircle } from '@/domain/circles/RecommendedCircle';
import type { Cadence } from '@/domain/circles/MyCircleDetail';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import {
  Slot,
  type SlotRestriction,
  type SlotsQuote,
  type SlotType,
} from '@/domain/circles/value-objects/Slot';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import type { Money } from '@/domain/shared/value-objects/Money';

import { moneyDto, toMoney } from './moneyDto';

/** DTO de GET /circles/installment-options (docs/api/circles.md). */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const cadenceDto = z.enum(['monthly', 'biweekly', 'weekly']);

const installmentOptionsDto = z.object({
  payout: moneyDto,
  /** Cadencia en la que se calcularon; un backend anterior no la envía (COPAYNI-116). */
  cadence: cadenceDto.optional(),
  options: z.array(
    z.object({
      months: z.number().int().positive(),
      /** COPAYNI-125; un backend anterior solo envía `months`, que vale lo mismo. */
      turns: z.number().int().positive().optional(),
      installment: moneyDto,
      cadence: cadenceDto.optional(),
      unit: z.string().min(1).optional(),
      approximateDays: z.number().int().positive().optional(),
      /** Propuesto para R5; si el backend no lo envía, la opción no se restringe. */
      withinMonthlyLimit: z.boolean().optional(),
    }),
  ),
  /**
   * Montos cercanos que sí admiten alguna duración, cuando `options` viene vacío
   * (COPAYNI-125). Un backend anterior no los envía.
   */
  alternatives: z
    .array(
      z.object({
        payout: moneyDto,
        options: z.array(
          z.object({
            turns: z.number().int().positive(),
            installment: moneyDto,
          }),
        ),
      }),
    )
    .default([]),
});

export const SLOT_TYPE_BY_DTO = {
  fastest_payout: 'fastestPayout',
  lowest_fees: 'lowestFees',
  highest_return: 'highestReturn',
} as const satisfies Record<string, SlotType>;

const RESTRICTION_BY_DTO = {
  trust_required: 'trustRequired',
  identity_required: 'identityRequired',
  income_required: 'incomeRequired',
} as const satisfies Record<string, SlotRestriction>;

/** DTO de GET /circles/slots (docs/api/circles.md). */
const slotsDto = z.object({
  /** Círculo ofrecido; `null` si es uno nuevo. */
  circleId: z.string().min(1).nullable(),
  payout: moneyDto,
  months: z.number().int().positive(),
  /** Condiciones reales de la junta (COPAYNI-116); un backend anterior no las envía. */
  turns: z.number().int().positive().optional(),
  cadence: cadenceDto.optional(),
  unit: z.string().min(1).optional(),
  startsOn: z.string().min(1).optional(),
  endsOn: z.string().min(1).optional(),
  startsOnDate: z.string().regex(DAY).optional(),
  endsOnDate: z.string().regex(DAY).optional(),
  durationDays: z.number().int().positive().optional(),
  slots: z.array(
    z.object({
      position: z.number().int().positive(),
      payoutPeriod: z.string(),
      /** Día real de cobro (COPAYNI-116); un backend anterior no lo envía. */
      payoutOn: z.string().regex(DAY).optional(),
      type: z.enum(['fastest_payout', 'lowest_fees', 'highest_return']),
      fee: moneyDto,
      discount: moneyDto,
      /** COPAYNI-59; un backend anterior no lo envía. */
      catchUp: moneyDto.optional(),
      /** COPAYNI-60; un backend anterior no los envía. */
      retention: moneyDto.optional(),
      notAllowedReason: z
        .enum(['trust_required', 'identity_required', 'income_required'])
        .nullable()
        .optional(),
      available: z.boolean(),
    }),
  ),
});

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** DTO de GET /circles/recommended (docs/api/circles.md). */
const recommendedDto = z.object({
  items: z.array(
    z.object({
      circleId: z.string().min(1),
      payout: moneyDto,
      months: z.number().int().positive(),
      startsOn: z.string().regex(PERIOD),
      endsOn: z.string().regex(PERIOD),
      baseInstallment: moneyDto,
      adminFee: moneyDto,
      availableSlots: z.number().int().positive(),
      vacancies: z
        .array(
          z.object({
            position: z.number().int().positive(),
            payoutPeriod: z.string().regex(PERIOD),
          }),
        )
        .default([]),
    }),
  ),
});

/** Adaptador HTTP del descubrimiento y la cotización de un Game'ya. */
export class CircleQuoteApiRepository implements CircleQuoteRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async listInstallmentOptions(
    payout: Money,
    cadence?: Cadence,
    signal?: AbortSignal,
  ): Promise<InstallmentOption[]> {
    const dto = await this.http.get('/circles/installment-options', {
      query: {
        payoutAmount: payout.amount,
        currency: payout.currency,
        ...(cadence && { cadence }),
      },
      signal,
      parse: (data) => installmentOptionsDto.parse(data),
    });
    return dto.options.map((option) =>
      InstallmentOption.create({
        turns: option.turns ?? option.months,
        installment: toMoney(option.installment),
        withinMonthlyLimit: option.withinMonthlyLimit,
        cadence: option.cadence ?? dto.cadence,
        unit: option.unit,
        approximateDays: option.approximateDays,
      }),
    );
  }

  async listRecommended(signal?: AbortSignal): Promise<RecommendedCircle[]> {
    const dto = await this.http.get('/circles/recommended', {
      signal,
      parse: (data) => recommendedDto.parse(data),
    });
    return dto.items.map((item) => ({
      ...item,
      payout: toMoney(item.payout),
      baseInstallment: toMoney(item.baseInstallment),
      adminFee: toMoney(item.adminFee),
    }));
  }

  async listSlots({
    payout,
    turns,
    cadence,
    signal,
    circleId,
  }: {
    payout: Money;
    turns: number;
    cadence?: Cadence;
    signal?: AbortSignal;
    circleId?: string | null;
  }): Promise<SlotsQuote> {
    const dto = await this.http.get('/circles/slots', {
      query: {
        payoutAmount: payout.amount,
        months: turns,
        ...(circleId && { circleId }),
        currency: payout.currency,
        ...(cadence && { cadence }),
      },
      signal,
      parse: (data) => slotsDto.parse(data),
    });
    const slots = dto.slots.map((slot) =>
      Slot.create({
        position: slot.position,
        payoutPeriod: slot.payoutPeriod,
        payoutOn: slot.payoutOn,
        type: SLOT_TYPE_BY_DTO[slot.type],
        fee: toMoney(slot.fee),
        discount: toMoney(slot.discount),
        available: slot.available,
        circleId: dto.circleId,
        ...(slot.catchUp && { catchUp: toMoney(slot.catchUp) }),
        ...(slot.retention && { retention: toMoney(slot.retention) }),
        notAllowedReason: slot.notAllowedReason ? RESTRICTION_BY_DTO[slot.notAllowedReason] : null,
      }),
    );
    const resolved = dto.cadence ?? 'monthly';
    return {
      circleId: dto.circleId,
      cadence: resolved,
      unit: dto.unit ?? 'Mes',
      turns: dto.turns ?? dto.months,
      // Un backend anterior no envía las fechas reales; en mensual el arranque es el día 1.
      startsOnDate: dto.startsOnDate ?? `${dto.startsOn}-01`,
      endsOnDate: dto.endsOnDate ?? `${dto.endsOn ?? dto.startsOn}-01`,
      durationDays: dto.durationDays ?? (dto.turns ?? dto.months) * 30,
      slots,
    };
  }
}
