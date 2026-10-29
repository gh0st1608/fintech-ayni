import { ApiProperty } from '@nestjs/swagger';

import { type RecommendedCircle } from '../../../application/use-cases/list-recommended-circles.use-case';
import { MoneyResponse } from './join-config.response';

export class VacancyResponse {
  @ApiProperty({ example: 7, description: 'Turno vacante: 1 = cobra el primer mes' })
  position!: number;

  @ApiProperty({ example: '2027-05', description: 'Mes de cobro del turno (YYYY-MM)' })
  payoutPeriod!: string;
}

export class RecommendedCircleResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ example: 10 })
  months!: number;

  @ApiProperty({ example: '2026-11', description: 'Primer mes (YYYY-MM)' })
  startsOn!: string;

  @ApiProperty({ example: '2027-08', description: 'Último mes (YYYY-MM)' })
  endsOn!: string;

  @ApiProperty({ type: MoneyResponse, description: 'Cuota base: payout / meses' })
  baseInstallment!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Admin Fees del círculo' })
  adminFee!: MoneyResponse;

  @ApiProperty({
    example: 7,
    description: 'Slots libres; en un círculo en curso, vacantes abiertas',
  })
  availableSlots!: number;

  @ApiProperty({
    type: [VacancyResponse],
    description: 'Turnos vacantes de un círculo en curso (COPAYNI-59); vacío si no empezó',
  })
  vacancies!: VacancyResponse[];
}

/** Contrato `GET /v1/circles/recommended` (docs/api/circles.md). */
export class RecommendedCirclesResponse {
  @ApiProperty({ type: [RecommendedCircleResponse] })
  items!: RecommendedCircleResponse[];

  static from(circles: RecommendedCircle[]): RecommendedCirclesResponse {
    return {
      items: circles.map(({ circleId, terms, adminFee, availableSlots, vacancies }) => ({
        circleId,
        payout: MoneyResponse.from(terms.payout),
        months: terms.months,
        startsOn: terms.startsOn.toString(),
        endsOn: terms.endsOn.toString(),
        baseInstallment: MoneyResponse.from(terms.baseInstallment),
        adminFee: MoneyResponse.from(adminFee),
        availableSlots,
        vacancies: vacancies.map(({ position, payoutPeriod }) => ({
          position,
          payoutPeriod: payoutPeriod.toString(),
        })),
      })),
    };
  }
}
