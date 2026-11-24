import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';

import { type CycleState } from '../../../domain/entities/circle-cycle';
import { type CadenceId } from '../../../domain/value-objects/cadence';
import { CircleMembershipEntity } from './circle-membership.entity';

/** bigint llega como string desde pg; los montos en céntimos caben en un entero seguro. */
export const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity({ name: 'circles' })
export class CircleEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('bigint', { name: 'payout_amount', transformer: bigintToNumber })
  payoutAmount!: number;

  @Column('char', { length: 3 })
  currency!: string;

  /** Número de turnos, y por tanto de puestos. Se llamaba `months` (COPAYNI-109). */
  @Column('smallint')
  turns!: number;

  /** Cada cuánto le toca un turno (COPAYNI-100). `monthly` en todos los anteriores. */
  @Column({ type: 'varchar', length: 16 })
  cadence!: CadenceId;

  /** Fecha real de arranque; día 1 del mes en cadencia mensual (COPAYNI-106). */
  @Column('date', { name: 'starts_on' })
  startsOn!: string;

  /** Estado del ciclo mensual (COPAYNI-56); lo escribe el repositorio del ciclo. */
  @Column({ type: 'varchar', name: 'cycle_state', insert: false, update: false })
  cycleState!: CycleState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => CircleMembershipEntity, (membership) => membership.circle)
  memberships?: CircleMembershipEntity[];
}
