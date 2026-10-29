import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { CYCLE_STATES, type CycleState } from '../../../domain/entities/circle-cycle';

export class CirclePauseRequest {
  @ApiProperty({ example: 'Revisión de un reclamo del círculo', description: 'Obligatorio' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

/** Contrato de `POST /admin/v1/circles/:circleId/pause|resume` (docs/api/circles.md). */
export class CirclePauseResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ enum: CYCLE_STATES })
  state!: CycleState;

  @ApiProperty({ description: 'false si ya estaba pausado (o en curso): no hay otro evento' })
  changed!: boolean;

  @ApiProperty({
    example: '2026-11',
    description: 'Mes de inicio, corrido si la pausa cambió de mes',
  })
  startsOn!: string;

  @ApiProperty({ example: '2027-08', description: 'Último mes, corrido si la pausa cambió de mes' })
  endsOn!: string;
}
