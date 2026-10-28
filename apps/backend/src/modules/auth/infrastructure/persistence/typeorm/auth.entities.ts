import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import { type OtpChannel } from '../../../../users/domain/value-objects/login-identifier';
import { type ChallengeStatus } from '../../../domain/entities/auth-challenge';

@Entity({ name: 'auth_challenges' })
export class AuthChallengeEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar', { length: 8 })
  channel!: OtpChannel;

  @Column('char', { name: 'code_hash', length: 64 })
  codeHash!: string;

  @Column('varchar', { length: 16 })
  status!: ChallengeStatus;

  @Column('smallint', { name: 'attempts_remaining' })
  attemptsRemaining!: number;

  @Column('smallint', { name: 'resends_remaining' })
  resendsRemaining!: number;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('timestamptz', { name: 'resend_available_at' })
  resendAvailableAt!: Date;

  /** Lo fija la aplicación con su reloj, no la base: el límite de inicios compara con él. */
  @Column('timestamptz', { name: 'created_at' })
  issuedAt!: Date;
}

@Entity({ name: 'refresh_tokens' })
export class RefreshTokenEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'family_id' })
  familyId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('char', { name: 'token_hash', length: 64 })
  tokenHash!: string;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('timestamptz', { name: 'used_at', nullable: true })
  usedAt!: Date | null;

  @Column('timestamptz', { name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
