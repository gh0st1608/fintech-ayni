import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { isUuid } from '../../../../../shared/infrastructure/persistence/postgres-errors';
import { type MemberHistoryPort } from '../../../application/ports/member-history.port';
import { CircleEntity } from './circle.entity';

/** MemberHistoryPort sobre PostgreSQL: los círculos terminados sin expulsión. */
@Injectable()
export class TypeOrmMemberHistory implements MemberHistoryPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async completedCirclesOf(userId: string): Promise<number> {
    if (!isUuid(userId)) return 0;
    const [row] = await this.circles.query<{ total: number }[]>(
      `SELECT count(*)::int AS total
         FROM circle_memberships m JOIN circles c ON c.id = m.circle_id
        WHERE m.user_id = $1 AND m.expelled_at IS NULL AND c.cycle_state = 'finished'`,
      [userId],
    );
    return row?.total ?? 0;
  }
}
