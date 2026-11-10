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

import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import { CYCLE_RUNS, type CycleRunsPort } from '../../../application/ports/cycle-runs.port';
import { FinancePageQuery } from '../dto/admin-finance.dto';

/** Quién ve el ciclo mensual (matriz de docs/backoffice-plan.md §5). */
const CYCLE_READERS: readonly StaffRole[] = ['support', 'operations', 'finance', 'super_admin'];

class CycleRunFailureResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ description: 'Mensaje del error, recortado' })
  reason!: string;
}

class CycleRunResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '2026-12-01', description: 'Día del negocio (America/Lima)' })
  businessDate!: string;

  @ApiProperty()
  startedAt!: string;

  @ApiProperty()
  finishedAt!: string;

  @ApiProperty({ description: 'Círculos que avanzaron' })
  advanced!: number;

  @ApiProperty({ description: 'Círculos que otra ejecución tenía bloqueados' })
  locked!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({ type: [CycleRunFailureResponse] })
  failures!: CycleRunFailureResponse[];
}

class CycleRunsResponse {
  @ApiProperty({ type: [CycleRunResponse] })
  items!: CycleRunResponse[];

  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;
}

/**
 * Ejecuciones de la tarea diaria del ciclo mensual (docs/backoffice-plan.md, fase 2): cuántos
 * círculos avanzaron y cuáles fallaron. Hasta ahora solo quedaban en los logs.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/cycle-runs', version: VERSION_NEUTRAL })
export class AdminCycleRunsController {
  constructor(@Inject(CYCLE_RUNS) private readonly runs: CycleRunsPort) {}

  @Get()
  @RequireStaff(CYCLE_READERS)
  @ApiOkResponse({
    type: CycleRunsResponse,
    description: 'Envuelto. De la más reciente a la más antigua',
  })
  @ApiBadRequestResponse({ description: 'limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve el ciclo (FORBIDDEN)' })
  async list(@Query() query: FinancePageQuery): Promise<CycleRunsResponse> {
    const page = await this.runs.list({ limit: query.limit ?? 25, cursor: query.cursor ?? null });
    return {
      items: page.items.map((run) => ({
        ...run,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
