import { Controller, Get, Inject, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import {
  DELINQUENCY_VIEWS,
  type DelinquencyItem,
  type DelinquencyView,
  ListDelinquencyUseCase,
} from '../../../application/use-cases/admin-delinquency.use-cases';
import { MoneyResponse } from '../dto/join-config.response';

/** Quién sigue la mora: finanzas cobra y operaciones atiende (docs/backoffice-plan.md §5). */
const DELINQUENCY_READERS: readonly StaffRole[] = ['finance', 'operations', 'super_admin'];
const DEFAULT_PAGE_SIZE = 25;

export class DelinquencyQuery {
  @ApiProperty({ enum: DELINQUENCY_VIEWS })
  @IsIn(DELINQUENCY_VIEWS)
  view!: DelinquencyView;

  @ApiPropertyOptional({ description: 'nextCursor de la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class DelinquencyMemberResponse {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true, example: 'Juana P.', description: 'Enmascarado' })
  name!: string | null;
}

export class DelinquencyItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ type: DelinquencyMemberResponse })
  member!: DelinquencyMemberResponse;

  @ApiProperty({ example: '2026-12' })
  period!: string;

  @ApiProperty({ example: '2026-12-01', description: 'Vencimiento o fecha de expulsión' })
  date!: string;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, nullable: true })
  lateFee!: MoneyResponse | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  settledAt!: string | null;

  @ApiProperty({ nullable: true, example: '2026-12-04' })
  graceEndsOn!: string | null;

  static from(item: DelinquencyItem): DelinquencyItemResponse {
    return {
      id: item.id,
      circleId: item.circleId,
      member: item.member,
      period: item.period,
      date: item.date,
      amount: MoneyResponse.from(item.amount),
      lateFee: item.lateFee ? MoneyResponse.from(item.lateFee) : null,
      settledAt: item.settledAt?.toISOString() ?? null,
      graceEndsOn: item.graceEndsOn,
    };
  }
}

export class DelinquencyResponse {
  @ApiProperty({ type: [DelinquencyItemResponse] })
  items!: DelinquencyItemResponse[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ type: [MoneyResponse], description: 'Pendiente (monto más cargo) por moneda' })
  pending!: MoneyResponse[];
}

/** Mora para el personal (COPAYNI-94): gracia, expulsiones, deudas y devoluciones. Solo lectura. */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/delinquency', version: VERSION_NEUTRAL })
export class AdminDelinquencyController {
  constructor(@Inject(ListDelinquencyUseCase) private readonly list: ListDelinquencyUseCase) {}

  @Get()
  @RequireStaff(DELINQUENCY_READERS)
  @ApiOkResponse({ type: DelinquencyResponse, description: 'Envuelto. De lo más reciente' })
  @ApiBadRequestResponse({ description: 'view, limit o cursor inválidos (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve la mora (FORBIDDEN)' })
  async get(@Query() query: DelinquencyQuery): Promise<DelinquencyResponse> {
    const page = await this.list.execute({
      view: query.view,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      items: page.items.map((item) => DelinquencyItemResponse.from(item)),
      nextCursor: page.nextCursor,
      pending: page.pending.map((money) => MoneyResponse.from(money)),
    };
  }
}
