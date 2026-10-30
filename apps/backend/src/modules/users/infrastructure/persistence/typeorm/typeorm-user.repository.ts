import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import { type UserRepositoryPort } from '../../../application/ports/user-repository.port';
import { ContactTakenError } from '../../../application/ports/user-repository.port';
import {
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '../../../../../shared/infrastructure/persistence/postgres-errors';
import { User } from '../../../domain/entities/user';
import { type LoginIdentifier } from '../../../domain/value-objects/login-identifier';
import { UserEntity } from './user.entity';

@Injectable()
export class TypeOrmUserRepository implements UserRepositoryPort {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  async findById(id: string): Promise<User | null> {
    if (!isUuid(id)) return null;
    const row = await this.users.findOneBy({ id });
    return row ? TypeOrmUserRepository.toDomain(row) : null;
  }

  async findByIdentifier(identifier: LoginIdentifier): Promise<User | null> {
    const row = await this.users.findOneBy({ [identifier.type]: identifier.value });
    return row ? TypeOrmUserRepository.toDomain(row) : null;
  }

  async findOrRegister(identifier: LoginIdentifier): Promise<User> {
    const column = identifier.type;
    const user = User.register(randomUUID(), identifier);
    // Si otro inicio simultáneo lo creó primero, el índice único descarta este insert.
    await this.users
      .createQueryBuilder()
      .insert()
      .values({ id: user.id, email: user.email, phone: user.phone, status: user.status })
      .orIgnore()
      .execute();
    const row = await this.users.findOneByOrFail({ [column]: identifier.value });
    return TypeOrmUserRepository.toDomain(row);
  }

  async save(user: User): Promise<void> {
    try {
      await this.users.update(
        { id: user.id },
        {
          status: user.status,
          preferredLanguage: user.preferredLanguage,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
        },
      );
    } catch (error) {
      // Otro usuario ya tiene ese email o teléfono (índices únicos de users).
      if (violatedConstraint(error, PG_UNIQUE_VIOLATION)) throw new ContactTakenError();
      throw error;
    }
  }

  private static toDomain(row: UserEntity): User {
    return User.restore({
      id: row.id,
      email: row.email,
      phone: row.phone,
      status: row.status,
      preferredLanguage: row.preferredLanguage,
      firstName: row.firstName,
      lastName: row.lastName,
    });
  }
}
