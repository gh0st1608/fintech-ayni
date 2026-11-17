import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import {
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type ExternalIdentitiesPort,
  type SocialAuthFlow,
  type SocialAuthFlowsPort,
} from '../../../application/ports/social-auth.ports';
import {
  type ExternalIdentity,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../../../domain/entities/external-identity';

interface IdentityRow {
  id: string;
  user_id: string;
  provider: IdentityProvider;
  subject: string;
  email: string | null;
  created_at: Date;
  last_login_at: Date | null;
}

const toIdentity = (row: IdentityRow): ExternalIdentity => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  subject: row.subject,
  email: row.email,
  createdAt: new Date(row.created_at),
  lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
});

const COLUMNS = 'id, user_id, provider, subject, email, created_at, last_login_at';

/** Identidades de Google y Apple vinculadas a usuarios de Ayni (COPAYNI-91). */
@Injectable()
export class SqlExternalIdentities implements ExternalIdentitiesPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(provider: IdentityProvider, subject: string): Promise<ExternalIdentity | null> {
    const rows = await this.dataSource.query<IdentityRow[]>(
      `SELECT ${COLUMNS} FROM external_identities WHERE provider = $1 AND subject = $2`,
      [provider, subject],
    );
    return rows[0] ? toIdentity(rows[0]) : null;
  }

  async ofUser(userId: string): Promise<ExternalIdentity[]> {
    const rows = await this.dataSource.query<IdentityRow[]>(
      `SELECT ${COLUMNS} FROM external_identities WHERE user_id = $1::uuid ORDER BY created_at`,
      [userId],
    );
    return rows.map(toIdentity);
  }

  /**
   * Alta del primer inicio: crea el usuario y su identidad en una sola transacción, para que no
   * quede un usuario sin identidad si algo falla a medias. Si otra petición ganó la carrera, la
   * unicidad de `(provider, subject)` la detiene y se devuelve la identidad que ya existe
   * (QA-10): el resultado es una sola cuenta.
   */
  async registerWithUser(input: {
    identity: VerifiedIdentity;
    email: string | null;
    at: Date;
  }): Promise<ExternalIdentity> {
    try {
      return await this.dataSource.transaction(async (manager: EntityManager) => {
        const [user] = await manager.query<{ id: string }[]>(
          `INSERT INTO users (email, status, first_name, last_name)
                VALUES ($1, 'active', $2, $3)
             RETURNING id`,
          [input.email, input.identity.firstName, input.identity.lastName],
        );
        const [identity] = await manager.query<IdentityRow[]>(
          `INSERT INTO external_identities (user_id, provider, subject, email, last_login_at)
                VALUES ($1::uuid, $2, $3, $4, $5)
             RETURNING ${COLUMNS}`,
          [
            user!.id,
            input.identity.provider,
            input.identity.subject,
            input.identity.email,
            input.at,
          ],
        );
        return toIdentity(identity!);
      });
    } catch (error) {
      const constraint = violatedConstraint(error, PG_UNIQUE_VIOLATION);
      if (constraint === undefined) throw error;
      const existing = await this.find(input.identity.provider, input.identity.subject);
      if (existing) return existing;
      throw error;
    }
  }

  async link(userId: string, identity: VerifiedIdentity, at: Date): Promise<ExternalIdentity> {
    const rows = await this.dataSource.query<IdentityRow[]>(
      `INSERT INTO external_identities (user_id, provider, subject, email, last_login_at)
            VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING ${COLUMNS}`,
      [userId, identity.provider, identity.subject, identity.email, at],
    );
    return toIdentity(rows[0]!);
  }

  async unlink(userId: string, provider: IdentityProvider): Promise<boolean> {
    const [, deleted] = await this.dataSource.query<[unknown[], number]>(
      'DELETE FROM external_identities WHERE user_id = $1::uuid AND provider = $2',
      [userId, provider],
    );
    return deleted > 0;
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.dataSource.query(
      'UPDATE external_identities SET last_login_at = $2 WHERE id = $1::uuid',
      [id, at],
    );
  }
}

interface FlowRow {
  state: string;
  provider: IdentityProvider;
  nonce: string;
  user_id: string | null;
  exchange_code_hash: string | null;
  expires_at: Date;
  consumed_at: Date | null;
}

const toFlow = (row: FlowRow): SocialAuthFlow => ({
  state: row.state,
  provider: row.provider,
  nonce: row.nonce,
  userId: row.user_id,
  exchangeCodeHash: row.exchange_code_hash,
  expiresAt: new Date(row.expires_at),
  consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
});

const FLOW_COLUMNS = 'state, provider, nonce, user_id, exchange_code_hash, expires_at, consumed_at';

/**
 * Intentos del flujo web de Apple en Android. `state` y el código interno se consumen con un
 * `UPDATE ... WHERE ... IS NULL` que devuelve la fila: la base garantiza que solo el primero gana,
 * así que un callback repetido o un código reutilizado no abren sesión (QA-14 y QA-17).
 */
@Injectable()
export class SqlSocialAuthFlows implements SocialAuthFlowsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(
    flow: Omit<SocialAuthFlow, 'userId' | 'exchangeCodeHash' | 'consumedAt'>,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO social_auth_flows (state, provider, nonce, expires_at)
            VALUES ($1, $2, $3, $4)`,
      [flow.state, flow.provider, flow.nonce, flow.expiresAt],
    );
  }

  async consumeState(state: string, now: Date): Promise<SocialAuthFlow | null> {
    const [rows] = await this.dataSource.query<[FlowRow[], number]>(
      `UPDATE social_auth_flows SET state_used_at = $2
        WHERE state = $1 AND state_used_at IS NULL AND expires_at > $2
    RETURNING ${FLOW_COLUMNS}`,
      [state, now],
    );
    return rows[0] ? toFlow(rows[0]) : null;
  }

  async attachExchangeCode(state: string, userId: string, codeHash: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE social_auth_flows SET user_id = $2::uuid, exchange_code_hash = $3 WHERE state = $1`,
      [state, userId, codeHash],
    );
  }

  async consumeExchangeCode(codeHash: string, now: Date): Promise<SocialAuthFlow | null> {
    const [rows] = await this.dataSource.query<[FlowRow[], number]>(
      `UPDATE social_auth_flows SET consumed_at = $2
        WHERE exchange_code_hash = $1 AND consumed_at IS NULL AND expires_at > $2
    RETURNING ${FLOW_COLUMNS}`,
      [codeHash, now],
    );
    return rows[0] ? toFlow(rows[0]) : null;
  }
}
