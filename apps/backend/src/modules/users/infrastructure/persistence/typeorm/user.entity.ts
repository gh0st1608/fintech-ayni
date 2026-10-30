import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { type UserStatus } from '../../../domain/entities/user';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('varchar', { length: 254, nullable: true })
  email!: string | null;

  @Column('varchar', { length: 16, nullable: true })
  phone!: string | null;

  @Column('varchar', { length: 32 })
  status!: UserStatus;

  @Column('varchar', { name: 'preferred_language', length: 35, nullable: true })
  preferredLanguage!: string | null;

  @Column('varchar', { name: 'first_name', length: 80, nullable: true })
  firstName!: string | null;

  @Column('varchar', { name: 'last_name', length: 80, nullable: true })
  lastName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
