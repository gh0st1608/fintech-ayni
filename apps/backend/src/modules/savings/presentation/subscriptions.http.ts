import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import { cardLabel } from '../../payments/application/ports/payment-method-log.port';
import { type SavedCard } from '../../payments/application/ports/saved-card-repository.port';
import {
  ListMySavingsUseCase,
  SubscribeToSavingPlanUseCase,
} from '../application/subscription.use-cases';
import {
  CONTRIBUTION_STATUSES,
  type ContributionStatus,
  type SavingSubscription,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from '../domain/saving-subscription';

export class SubscribeRequest {
  @ApiProperty({ example: 'gold' })
  @IsString()
  @MaxLength(32)
  planId!: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(120)
  months!: number;

  @ApiProperty({ format: 'uuid', description: 'Tarjeta guardada con que se cobra el aporte' })
  @IsUUID()
  cardId!: string;

  @ApiProperty({ description: 'Cobrar los aportes siguientes sin entrar a la app' })
  @IsBoolean()
  autoDebit!: boolean;
}

export class ContributionResponse {
  @ApiProperty()
  sequence!: number;

  @ApiProperty({ example: '2026-12-15' })
  dueOn!: string;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty({ enum: CONTRIBUTION_STATUSES })
  status!: ContributionStatus;
}

export class SubscriptionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'gold' })
  planId!: string;

  @ApiProperty()
  months!: number;

  @ApiProperty({ enum: SUBSCRIPTION_STATUSES })
  status!: SubscriptionStatus;

  @ApiProperty({ type: MoneyResponse })
  target!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse })
  cashback!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Lo ahorrado hasta ahora' })
  saved!: MoneyResponse;

  @ApiProperty({ example: 1, description: 'Aportes pagados' })
  paidContributions!: number;

  @ApiProperty({ type: ContributionResponse, nullable: true, description: 'El próximo aporte' })
  nextContribution!: ContributionResponse | null;

  @ApiProperty({ example: '2027-12', description: 'Mes en que recibe lo ahorrado y el cashback' })
  payoutPeriod!: string;

  @ApiProperty()
  autoDebit!: boolean;

  @ApiProperty({ example: 'Visa •••• 4242', nullable: true })
  card!: string | null;

  static from(subscription: SavingSubscription, card: SavedCard | null): SubscriptionResponse {
    const paid = subscription.contributions.filter(({ status }) => status === 'paid');
    const next = subscription.contributions.find(({ status }) => status === 'pending');
    return {
      id: subscription.id,
      planId: subscription.planId,
      months: subscription.months,
      status: subscription.status,
      target: MoneyResponse.from(subscription.target),
      cashback: MoneyResponse.from(subscription.cashback),
      saved: {
        amount: paid.reduce((sum, { amount }) => sum + amount.amount, 0),
        currency: subscription.target.currency,
      },
      paidContributions: paid.length,
      nextContribution: next
        ? {
            sequence: next.sequence,
            dueOn: next.dueOn,
            amount: MoneyResponse.from(next.amount),
            status: next.status,
          }
        : null,
      payoutPeriod: subscription.payoutPeriod,
      autoDebit: subscription.autoDebit,
      card: card ? cardLabel(card.brand, card.lastFour) : null,
    };
  }
}

export class MySavingsResponse {
  @ApiProperty({ type: [SubscriptionResponse] })
  items!: SubscriptionResponse[];
}

/** Suscribirse a un plan de ahorro y ver las suscripciones (COPAYNI-79, docs/api/savings.md). */
@ApiTags('savings')
@ApiBearerAuth()
@Controller({ version: '1' })
export class SavingSubscriptionsController {
  constructor(
    @Inject(SubscribeToSavingPlanUseCase) private readonly subscribe: SubscribeToSavingPlanUseCase,
    @Inject(ListMySavingsUseCase) private readonly listMine: ListMySavingsUseCase,
  ) {}

  @Post('savings/subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '16 a 255 caracteres' })
  @ApiOkResponse({ type: SubscriptionResponse, description: 'Envuelto. active o pending' })
  @ApiBadRequestResponse({ description: 'Cuerpo o Idempotency-Key inválidos (VALIDATION_ERROR)' })
  @ApiNotFoundResponse({ description: 'SAVING_PLAN_NOT_FOUND o CARD_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'SAVING_PAYMENT_REJECTED con details.detail' })
  @ApiConflictResponse({ description: 'IDEMPOTENCY_KEY_REUSED' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SubscribeRequest,
  ): Promise<SubscriptionResponse> {
    const subscription = await this.subscribe.execute(principal, body, idempotencyKey);
    const [mine] = (await this.listMine.execute(principal)).filter(
      (item) => item.subscription.id === subscription.id,
    );
    return SubscriptionResponse.from(subscription, mine?.card ?? null);
  }

  @Get('me/savings')
  @ApiOkResponse({ type: MySavingsResponse, description: 'Envuelto. De la más reciente' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<MySavingsResponse> {
    const items = await this.listMine.execute(principal);
    return {
      items: items.map(({ subscription, card }) => SubscriptionResponse.from(subscription, card)),
    };
  }
}
