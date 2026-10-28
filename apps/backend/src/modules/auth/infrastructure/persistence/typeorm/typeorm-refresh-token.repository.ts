import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';

import {
  type RefreshTokenRepositoryPort,
  type RefreshTokenUse,
} from '../../../application/ports/auth.ports';
import { RefreshTokenEntity } from './auth.entities';

@Injectable()
export class TypeOrmRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly tokens: Repository<RefreshTokenEntity>,
  ) {}

  async create(token: {
    familyId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.tokens.insert({ id: randomUUID(), ...token, usedAt: null, revokedAt: null });
  }

  async consume(tokenHash: string, now: Date): Promise<RefreshTokenUse> {
    // Un solo UPDATE condicional: de dos renovaciones simultáneas con el mismo token, solo una
    // lo marca como usado; la otra lo ve usado y se trata como reutilización.
    // Con UPDATE, el driver de TypeORM devuelve [filas, cantidad].
    const [rows] = await this.tokens.query<[{ family_id: string; user_id: string }[], number]>(
      `UPDATE refresh_tokens SET used_at = $2
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2
        RETURNING family_id, user_id`,
      [tokenHash, now],
    );
    const [used] = rows;
    if (used) return { status: 'valid', familyId: used.family_id, userId: used.user_id };

    const row = await this.tokens.findOneBy({ tokenHash });
    return row?.usedAt ? { status: 'reused', familyId: row.familyId } : { status: 'invalid' };
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.tokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: now });
  }

  async revokeFamilyOf(tokenHash: string, now: Date): Promise<void> {
    const row = await this.tokens.findOneBy({ tokenHash });
    if (row) await this.revokeFamily(row.familyId, now);
  }
}
