import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { CircleEntity } from './circle.entity';

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
