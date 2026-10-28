import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';

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

  @Column('smallint')
  months!: number;

  /** Primer día del mes de inicio (`YYYY-MM-01`). */
  @Column('date', { name: 'starts_on' })
  startsOn!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => CircleMembershipEntity, (membership) => membership.circle)
  memberships?: CircleMembershipEntity[];
}
