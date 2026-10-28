import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { AuthChallenge } from '@src/modules/auth/domain/entities/auth-challenge';
import {
  AuthChallengeEntity,
  RefreshTokenEntity,
} from '@src/modules/auth/infrastructure/persistence/typeorm/auth.entities';
import { TypeOrmAuthChallengeRepository } from '@src/modules/auth/infrastructure/persistence/typeorm/typeorm-auth-challenge.repository';
import { TypeOrmRefreshTokenRepository } from '@src/modules/auth/infrastructure/persistence/typeorm/typeorm-refresh-token.repository';
import { LoginIdentifier } from '@src/modules/users/domain/value-objects/login-identifier';
import { UserEntity } from '@src/modules/users/infrastructure/persistence/typeorm/user.entity';
import { TypeOrmUserRepository } from '@src/modules/users/infrastructure/persistence/typeorm/typeorm-user.repository';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const POLICY = { codeTtlSeconds: 300, resendCooldownSeconds: 30, maxAttempts: 5, maxResends: 3 };

describe('Repositorios de auth contra PostgreSQL', () => {
  let dataSource: DataSource;
  let users: TypeOrmUserRepository;
  let challenges: TypeOrmAuthChallengeRepository;
  let refreshTokens: TypeOrmRefreshTokenRepository;

  beforeAll(async () => {
    dataSource = await openTestDatabase([UserEntity, AuthChallengeEntity, RefreshTokenEntity]);
    users = new TypeOrmUserRepository(dataSource.getRepository(UserEntity));
    challenges = new TypeOrmAuthChallengeRepository(dataSource.getRepository(AuthChallengeEntity));
    refreshTokens = new TypeOrmRefreshTokenRepository(dataSource.getRepository(RefreshTokenEntity));
  });

  afterAll(() => dataSource.destroy());

  describe('TypeOrmUserRepository', () => {
    const email = () => LoginIdentifier.parse(`${randomUUID()}@mail.com`, 'email');

    it('dos inicios simultáneos con el mismo identificador obtienen el mismo usuario', async () => {
      const identifier = email();
      const [first, second] = await Promise.all([
        users.findOrRegister(identifier),
        users.findOrRegister(identifier),
      ]);

      expect(first.id).toBe(second.id);
      expect(first.status).toBe('pending_verification');
      await expect(
        dataSource.getRepository(UserEntity).countBy({ email: identifier.value }),
      ).resolves.toBe(1);
    });

    it('registra por teléfono y guarda el estado y el idioma', async () => {
      const phone = `+51${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
      const user = await users.findOrRegister(LoginIdentifier.parse(phone, 'phone'));
      user.activate();
      user.changePreferredLanguage('en');
      await users.save(user);

      expect(await users.findById(user.id)).toMatchObject({
        phone,
        email: null,
        status: 'active',
        preferredLanguage: 'en',
      });
    });

    it('un id inexistente o que no es uuid devuelve null', async () => {
      await expect(users.findById(randomUUID())).resolves.toBeNull();
      await expect(users.findById('nope')).resolves.toBeNull();
    });
  });

  describe('TypeOrmAuthChallengeRepository', () => {
    const newChallenge = async (now = new Date()) => {
      const challenge = AuthChallenge.issue({
        id: randomUUID(),
        userId: await insertTestUser(dataSource),
        channel: 'email',
        codeHash: 'a'.repeat(64),
        now,
        policy: POLICY,
      });
      await challenges.create(challenge);
      return challenge;
    };

    it('diez intentos fallidos simultáneos descuentan exactamente cinco y bloquean', async () => {
      const { id } = await newChallenge();
      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () =>
          challenges.update(id, (challenge) => challenge.attempt(false, new Date())),
        ),
      );

      const kinds = outcomes.map((outcome) => outcome?.kind);
      expect(kinds.filter((kind) => kind === 'invalid')).toHaveLength(4);
      expect(kinds.filter((kind) => kind === 'attempts_exceeded')).toHaveLength(6);
      const stored = await dataSource.getRepository(AuthChallengeEntity).findOneByOrFail({ id });
      expect(stored).toMatchObject({ status: 'locked', attemptsRemaining: 0 });
    });

    it('si el cambio lanza, no guarda nada', async () => {
      const { id } = await newChallenge();
      await expect(
        challenges.update(id, (challenge) => {
          challenge.attempt(false, new Date());
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      const stored = await dataSource.getRepository(AuthChallengeEntity).findOneByOrFail({ id });
      expect(stored.attemptsRemaining).toBe(5);
    });

    it('devuelve null para un desafío inexistente o un id que no es uuid', async () => {
      await expect(challenges.update(randomUUID(), () => 'x')).resolves.toBeNull();
      await expect(challenges.update('ch-1', () => 'x')).resolves.toBeNull();
    });

    it('cuenta los desafíos emitidos desde una fecha y devuelve el más antiguo', async () => {
      const first = await newChallenge();
      const userId = first.snapshot.userId;
      const since = new Date(Date.now() - 60_000);
      await challenges.create(
        AuthChallenge.issue({
          id: randomUUID(),
          userId,
          channel: 'email',
          codeHash: 'b'.repeat(64),
          now: new Date(),
          policy: POLICY,
        }),
      );

      const recent = await challenges.issuedSince(userId, since);
      expect(recent.count).toBe(2);
      expect(recent.oldest).toBeInstanceOf(Date);
      await expect(challenges.issuedSince(userId, new Date(Date.now() + 60_000))).resolves.toEqual({
        count: 0,
        oldest: null,
      });
    });
  });

  describe('TypeOrmRefreshTokenRepository', () => {
    const newToken = async (expiresInMs = 60_000) => {
      const token = {
        familyId: randomUUID(),
        userId: await insertTestUser(dataSource),
        tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + expiresInMs),
      };
      await refreshTokens.create(token);
      return token;
    };

    it('un token se usa una sola vez: la segunda vez es reutilización', async () => {
      const token = await newToken();
      await expect(refreshTokens.consume(token.tokenHash, new Date())).resolves.toEqual({
        status: 'valid',
        familyId: token.familyId,
        userId: token.userId,
      });
      await expect(refreshTokens.consume(token.tokenHash, new Date())).resolves.toEqual({
        status: 'reused',
        familyId: token.familyId,
      });
    });

    it('dos renovaciones simultáneas: una vale y la otra se detecta como reutilización', async () => {
      const token = await newToken();
      const uses = await Promise.all([
        refreshTokens.consume(token.tokenHash, new Date()),
        refreshTokens.consume(token.tokenHash, new Date()),
      ]);
      expect(uses.map(({ status }) => status).sort()).toEqual(['reused', 'valid']);
    });

    it('un token vencido, revocado o desconocido no vale', async () => {
      const expired = await newToken(-1_000);
      await expect(refreshTokens.consume(expired.tokenHash, new Date())).resolves.toEqual({
        status: 'invalid',
      });

      const revoked = await newToken();
      await refreshTokens.revokeFamilyOf(revoked.tokenHash, new Date());
      await expect(refreshTokens.consume(revoked.tokenHash, new Date())).resolves.toEqual({
        status: 'invalid',
      });

      await expect(refreshTokens.consume('f'.repeat(64), new Date())).resolves.toEqual({
        status: 'invalid',
      });
      await expect(
        refreshTokens.revokeFamilyOf('f'.repeat(64), new Date()),
      ).resolves.toBeUndefined();
    });

    it('revocar la familia invalida todos sus tokens', async () => {
      const first = await newToken();
      const sibling = { ...first, tokenHash: 'e'.repeat(64 - 8) + randomUUID().slice(0, 8) };
      await refreshTokens.create(sibling);
      await refreshTokens.revokeFamily(first.familyId, new Date());

      for (const { tokenHash } of [first, sibling]) {
        await expect(refreshTokens.consume(tokenHash, new Date())).resolves.toEqual({
          status: 'invalid',
        });
      }
    });
  });
});
