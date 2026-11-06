import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { type StartProposalView } from '../../../application/use-cases/start-proposal.use-cases';
import { START_DECISIONS, type StartDecision } from '../../../domain/services/start-approval';
import { SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { MoneyResponse } from './join-config.response';

const toMoney = ({ amount, currency }: { amount: number; currency: string }): MoneyResponse => ({
  amount,
  currency,
});

class StartTermsResponse {
  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse })
  baseInstallment!: MoneyResponse;

  @ApiProperty({ description: 'Integrantes y meses' })
  months!: number;
}

export class StartProposalResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ type: StartTermsResponse, description: 'Las condiciones con las que se unió' })
  current!: StartTermsResponse;

  @ApiProperty({ type: StartTermsResponse, description: 'Las condiciones reducidas' })
  proposed!: StartTermsResponse;

  @ApiProperty({ description: 'Su turno en el círculo reducido' })
  position!: number;

  @ApiProperty({ enum: SLOT_TYPES })
  slotType!: SlotType;

  @ApiProperty({ type: MoneyResponse, description: 'Lo que recibe en su mes de cobro' })
  netPayout!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Su primera cuota' })
  firstInstallment!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Lo que pagará en total' })
  totalPaid!: MoneyResponse;

  @ApiProperty({ example: '2026-11-08', description: 'Último día para responder' })
  respondBy!: string;

  @ApiPropertyOptional({ enum: START_DECISIONS, nullable: true })
  decision!: StartDecision | null;

  static from(view: StartProposalView): StartProposalResponse {
    const terms = ({ payout, baseInstallment, months }: StartProposalView['current']) => ({
      payout: toMoney(payout),
      baseInstallment: toMoney(baseInstallment),
      months,
    });
    return {
      circleId: view.circleId,
      current: terms(view.current),
      proposed: terms(view.proposed),
      position: view.quote.position,
      slotType: view.quote.type,
      netPayout: toMoney(view.quote.netPayout),
      firstInstallment: toMoney(view.quote.installments[0]!),
      totalPaid: toMoney(view.quote.totalPaid),
      respondBy: view.respondBy,
      decision: view.decision,
    };
  }
}

export class StartProposalsResponse {
  @ApiProperty({ type: [StartProposalResponse] })
  items!: StartProposalResponse[];
}
