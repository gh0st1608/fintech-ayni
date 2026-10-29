import type { MyCircle } from '@/domain/circles/MyCircle';
import type { RecommendedCircle } from '@/domain/circles/RecommendedCircle';
import { Money } from '@/domain/shared/value-objects/Money';

const pen = (major: number) => Money.fromMajor(major, 'PEN');

/** Un círculo de 30.000 en 6 meses, turno 3, desde noviembre de 2026; se puede sobrescribir. */
export function myCircle(overrides: Partial<MyCircle> = {}): MyCircle {
  return {
    circleId: 'c-1',
    status: 'active',
    payout: pen(30_000),
    months: 6,
    startsOn: '2026-11',
    endsOn: '2027-04',
    position: 3,
    payoutPeriod: '2027-01',
    type: 'lowestFees',
    installments: [pen(5_600), pen(5_600), pen(5_600), pen(5_000), pen(5_000), pen(5_000)],
    adminFee: pen(1_800),
    netPayout: pen(30_000),
    joinedAt: new Date('2026-10-20T15:00:00Z'),
    ...overrides,
  };
}

/** Un círculo abierto de 30.000 en 10 meses, desde noviembre de 2026; se puede sobrescribir. */
export function recommendedCircle(overrides: Partial<RecommendedCircle> = {}): RecommendedCircle {
  return {
    circleId: 'r-1',
    payout: pen(30_000),
    months: 10,
    startsOn: '2026-11',
    endsOn: '2027-08',
    baseInstallment: pen(3_000),
    adminFee: pen(3_600),
    availableSlots: 7,
    ...overrides,
  };
}
