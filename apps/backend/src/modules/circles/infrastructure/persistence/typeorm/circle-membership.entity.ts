import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { CircleEntity } from './circle.entity';
import { type StoredSlotPrice } from './slot-price.mapper';

@Entity({ name: 'circle_memberships' })
export class CircleMembershipEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'circle_id' })
  circleId!: string;

  @ManyToOne(() => CircleEntity, (circle) => circle.memberships)
  @JoinColumn({ name: 'circle_id' })
  circle?: CircleEntity;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('smallint')
  position!: number;

  @Column('varchar', { name: 'idempotency_key', length: 255 })
  idempotencyKey!: string;

  /** `NULL` en las membresías anteriores a COPAYNI-55. */
  @Column('jsonb', { nullable: true })
  price!: StoredSlotPrice | null;

  /** Expulsión por impago (COPAYNI-57); `NULL` mientras sigue en el círculo. */
  @Column('timestamptz', { name: 'expelled_at', nullable: true })
  expelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
